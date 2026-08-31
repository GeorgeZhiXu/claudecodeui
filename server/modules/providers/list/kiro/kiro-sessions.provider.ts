import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { IProviderSessions } from '@/shared/interfaces.js';
import type {
  FetchHistoryOptions,
  FetchHistoryResult,
  NormalizedMessage,
} from '@/shared/types.js';
import {
  createNormalizedMessage,
  generateMessageId,
  normalizeProviderTimestamp,
  readObjectRecord,
  readOptionalString,
  sanitizeLeafDirectoryName,
  sliceTailPage,
} from '@/shared/utils.js';

const PROVIDER = 'kiro';
const getKiroSessionsDirectory = (): string => (
  path.join(os.homedir(), '.kiro', 'sessions', 'cli')
);

function readKiroText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(readKiroText).filter(Boolean).join('\n');
  }

  const record = readObjectRecord(value);
  if (!record) {
    return value === undefined || value === null ? '' : String(value);
  }

  return readKiroText(
    record.text
    ?? record.data
    ?? record.content
    ?? record.output
    ?? record.result,
  );
}

function getHistoryTimestamp(data: Record<string, unknown>): string {
  const metadata = readObjectRecord(data.meta);
  return normalizeProviderTimestamp(metadata?.timestamp ?? data.timestamp);
}

function normalizeHistoryEntry(
  rawMessage: Record<string, unknown>,
  sessionId: string | null,
): NormalizedMessage[] {
  const data = readObjectRecord(rawMessage.data);
  if (!data) {
    return [];
  }

  const entryKind = readOptionalString(rawMessage.kind);
  const content = Array.isArray(data.content) ? data.content : [];
  const timestamp = getHistoryTimestamp(data);
  const baseId = readOptionalString(data.message_id) ?? generateMessageId('kiro');
  const messages: NormalizedMessage[] = [];

  for (const [index, rawPart] of content.entries()) {
    const part = readObjectRecord(rawPart);
    const partKind = readOptionalString(part?.kind);
    if (!part || !partKind) {
      continue;
    }

    if (partKind === 'text') {
      const text = readKiroText(part.data);
      if (!text.trim()) {
        continue;
      }

      messages.push(createNormalizedMessage({
        id: `${baseId}_${index}`,
        sessionId,
        timestamp,
        provider: PROVIDER,
        kind: 'text',
        role: entryKind === 'Prompt' ? 'user' : 'assistant',
        content: text,
      }));
      continue;
    }

    const partData = readObjectRecord(part.data);
    if (partKind === 'toolUse' && partData) {
      const toolId = readOptionalString(partData.toolUseId) ?? `${baseId}_tool_${index}`;
      messages.push(createNormalizedMessage({
        id: `${baseId}_${index}`,
        sessionId,
        timestamp,
        provider: PROVIDER,
        kind: 'tool_use',
        toolName: readOptionalString(partData.name) ?? 'Tool',
        toolInput: partData.input ?? {},
        toolId,
      }));
      continue;
    }

    if (partKind === 'toolResult' && partData) {
      messages.push(createNormalizedMessage({
        id: `${baseId}_${index}`,
        sessionId,
        timestamp,
        provider: PROVIDER,
        kind: 'tool_result',
        toolId: readOptionalString(partData.toolUseId) ?? '',
        content: readKiroText(partData.content),
        isError: readOptionalString(partData.status) === 'error',
      }));
    }
  }

  return messages;
}

/** Session facet used by REST history reads and live Kiro event normalization. */
export class KiroSessionsProvider implements IProviderSessions {
  normalizeMessage(rawMessage: unknown, sessionId: string | null): NormalizedMessage[] {
    const raw = readObjectRecord(rawMessage);
    if (!raw) {
      return [];
    }

    if (typeof raw.kind === 'string' && raw.data) {
      return normalizeHistoryEntry(raw, sessionId);
    }

    const type = readOptionalString(raw.type);
    const eventSessionId = readOptionalString(raw.session_id) ?? sessionId;

    if (type === 'assistant') {
      const content = readKiroText(raw.content);
      return content
        ? [createNormalizedMessage({
            sessionId: eventSessionId,
            provider: PROVIDER,
            kind: 'stream_delta',
            content,
          })]
        : [];
    }

    if (type === 'tool_use') {
      return [createNormalizedMessage({
        id: readOptionalString(raw.id) ?? undefined,
        sessionId: eventSessionId,
        provider: PROVIDER,
        kind: 'tool_use',
        toolName: readOptionalString(raw.name) ?? 'Tool',
        toolInput: raw.input ?? {},
        toolId: readOptionalString(raw.id) ?? '',
        status: readOptionalString(raw.status),
      })];
    }

    if (type === 'tool_progress') {
      const content = readKiroText(raw.content);
      return content
        ? [createNormalizedMessage({
            sessionId: eventSessionId,
            provider: PROVIDER,
            kind: 'stream_delta',
            content,
            toolId: readOptionalString(raw.tool_id),
          })]
        : [];
    }

    if (type === 'result') {
      return [createNormalizedMessage({
        sessionId: eventSessionId,
        provider: PROVIDER,
        kind: 'stream_end',
      })];
    }

    return [];
  }

  async fetchHistory(
    sessionId: string,
    options: FetchHistoryOptions = {},
  ): Promise<FetchHistoryResult> {
    const limit = options.limit ?? null;
    const offset = Math.max(0, options.offset ?? 0);
    const providerSessionId = sanitizeLeafDirectoryName(
      options.providerSessionId ?? sessionId,
      'Kiro session id',
    );
    const historyPath = path.join(getKiroSessionsDirectory(), `${providerSessionId}.jsonl`);

    let content: string;
    try {
      content = await readFile(historyPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { messages: [], total: 0, hasMore: false, offset, limit };
      }
      throw error;
    }

    const messages = content
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .flatMap((line) => {
        try {
          const parsed = readObjectRecord(JSON.parse(line));
          return parsed ? normalizeHistoryEntry(parsed, sessionId) : [];
        } catch {
          return [];
        }
      });
    const { page, hasMore } = sliceTailPage(messages, limit, offset);

    return {
      messages: page,
      total: messages.length,
      hasMore,
      offset,
      limit,
    };
  }
}
