import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { sessionsDb } from '@/modules/database/index.js';
import type { IProviderSessionSynchronizer } from '@/shared/interfaces.js';
import {
  findFilesRecursivelyCreatedAfter,
  normalizeProviderTimestamp,
  normalizeSessionName,
  readObjectRecord,
  readOptionalString,
  readFileTimestamps,
} from '@/shared/utils.js';

const KIRO_SESSIONS_DIRECTORY = path.join(os.homedir(), '.kiro', 'sessions', 'cli');

type KiroSessionMetadata = {
  sessionId: string;
  projectPath: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
};

const normalizeOptionalTimestamp = (value: unknown): string | undefined => (
  value === undefined || value === null
    ? undefined
    : normalizeProviderTimestamp(value)
);

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Session indexer used by startup scans and the Kiro session file watcher. */
export class KiroSessionSynchronizer implements IProviderSessionSynchronizer {
  private readonly provider = 'kiro' as const;

  async synchronize(since?: Date): Promise<number> {
    const metadataFiles = await findFilesRecursivelyCreatedAfter(
      KIRO_SESSIONS_DIRECTORY,
      '.json',
      since ?? null,
    );

    let processed = 0;
    for (const filePath of metadataFiles) {
      const sessionId = await this.synchronizeFile(filePath);
      if (sessionId) {
        processed += 1;
      }
    }

    return processed;
  }

  async synchronizeFile(filePath: string): Promise<string | null> {
    if (!filePath.endsWith('.json') && !filePath.endsWith('.jsonl')) {
      return null;
    }

    const metadataPath = filePath.endsWith('.jsonl')
      ? filePath.slice(0, -1)
      : filePath;
    const metadata = await this.readMetadata(metadataPath);
    if (!metadata) {
      return null;
    }

    const historyPath = path.join(
      path.dirname(metadataPath),
      `${metadata.sessionId}.jsonl`,
    );
    const storedHistoryPath = await fileExists(historyPath) ? historyPath : metadataPath;
    const fileTimestamps = await readFileTimestamps(metadataPath);
    const pendingSession = sessionsDb.getSessionByProviderSessionId(metadata.sessionId)
      ?? sessionsDb.getSessionById(metadata.sessionId)
      ?? sessionsDb.findLatestPendingAppSession(this.provider, metadata.projectPath);

    if (pendingSession && !pendingSession.provider_session_id) {
      sessionsDb.assignProviderSessionId(pendingSession.session_id, metadata.sessionId);
    }

    return sessionsDb.createSession(
      metadata.sessionId,
      this.provider,
      metadata.projectPath,
      normalizeSessionName(metadata.title, 'Untitled Kiro Session'),
      metadata.createdAt ?? fileTimestamps.createdAt,
      metadata.updatedAt ?? fileTimestamps.updatedAt,
      storedHistoryPath,
    );
  }

  private async readMetadata(filePath: string): Promise<KiroSessionMetadata | null> {
    try {
      const raw = readObjectRecord(JSON.parse(await readFile(filePath, 'utf8')));
      const sessionId = readOptionalString(raw?.session_id);
      const projectPath = readOptionalString(raw?.cwd);
      if (!sessionId || !projectPath) {
        return null;
      }

      return {
        sessionId,
        projectPath,
        title: readOptionalString(raw?.title),
        createdAt: normalizeOptionalTimestamp(raw?.created_at),
        updatedAt: normalizeOptionalTimestamp(raw?.updated_at),
      };
    } catch {
      return null;
    }
  }
}
