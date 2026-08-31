import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { KiroSessionsProvider } from '@/modules/providers/list/kiro/kiro-sessions.provider.js';

const SESSION_ID = 'app-session-1';

const patchHomeDir = (nextHomeDir: string) => {
  const original = os.homedir;
  (os as any).homedir = () => nextHomeDir;
  return () => {
    (os as any).homedir = original;
  };
};

test('Kiro normalizes persisted prompts, assistant output, and tool activity', () => {
  const provider = new KiroSessionsProvider();

  const prompt = provider.normalizeMessage({
    version: 'v1',
    kind: 'Prompt',
    data: {
      message_id: 'prompt-1',
      meta: { timestamp: '2026-08-31T10:00:00.000Z' },
      content: [{ kind: 'text', data: 'Inspect the repository.' }],
    },
  }, SESSION_ID);
  assert.deepEqual(prompt.map(({ id, kind, role, content, timestamp }) => ({
    id,
    kind,
    role,
    content,
    timestamp,
  })), [{
    id: 'prompt-1_0',
    kind: 'text',
    role: 'user',
    content: 'Inspect the repository.',
    timestamp: '2026-08-31T10:00:00.000Z',
  }]);

  const assistant = provider.normalizeMessage({
    version: 'v1',
    kind: 'AssistantMessage',
    data: {
      message_id: 'assistant-1',
      timestamp: '2026-08-31T10:00:01.000Z',
      content: [
        { kind: 'text', data: 'I will inspect it.' },
        {
          kind: 'toolUse',
          data: {
            toolUseId: 'tool-1',
            name: 'shell',
            input: { command: 'git status' },
          },
        },
      ],
    },
  }, SESSION_ID);
  assert.equal(assistant.length, 2);
  assert.deepEqual(
    assistant.map(({ id, kind }) => ({ id, kind })),
    [
      { id: 'assistant-1_0', kind: 'text' },
      { id: 'assistant-1_1', kind: 'tool_use' },
    ],
  );
  assert.equal(assistant[0].role, 'assistant');
  assert.equal(assistant[0].content, 'I will inspect it.');
  assert.equal(assistant[1].toolId, 'tool-1');
  assert.equal(assistant[1].toolName, 'shell');
  assert.deepEqual(assistant[1].toolInput, { command: 'git status' });

  const result = provider.normalizeMessage({
    version: 'v1',
    kind: 'ToolResults',
    data: {
      message_id: 'result-1',
      content: [{
        kind: 'toolResult',
        data: {
          toolUseId: 'tool-1',
          content: [{ text: 'working tree clean' }, { data: 'done' }],
          status: 'error',
        },
      }],
    },
  }, SESSION_ID);
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'tool_result');
  assert.equal(result[0].toolId, 'tool-1');
  assert.equal(result[0].content, 'working tree clean\ndone');
  assert.equal(result[0].isError, true);
});

test('Kiro normalizes live SDK events and ignores unsupported payloads', () => {
  const provider = new KiroSessionsProvider();

  const assistant = provider.normalizeMessage({
    type: 'assistant',
    session_id: 'provider-session-1',
    content: 'Streaming response',
  }, SESSION_ID);
  assert.equal(assistant.length, 1);
  assert.equal(assistant[0].kind, 'stream_delta');
  assert.equal(assistant[0].sessionId, 'provider-session-1');
  assert.equal(assistant[0].content, 'Streaming response');

  const toolUse = provider.normalizeMessage({
    type: 'tool_use',
    session_id: 'provider-session-1',
    id: 'tool-2',
    name: 'read',
    input: { path: 'README.md' },
    status: 'running',
  }, SESSION_ID);
  assert.equal(toolUse[0].kind, 'tool_use');
  assert.equal(toolUse[0].toolId, 'tool-2');
  assert.equal(toolUse[0].status, 'running');

  const progress = provider.normalizeMessage({
    type: 'tool_progress',
    session_id: 'provider-session-1',
    tool_id: 'tool-2',
    content: [{ text: 'Reading' }, 'complete'],
  }, SESSION_ID);
  assert.equal(progress[0].kind, 'stream_delta');
  assert.equal(progress[0].toolId, 'tool-2');
  assert.equal(progress[0].content, 'Reading\ncomplete');

  const result = provider.normalizeMessage({
    type: 'result',
    session_id: 'provider-session-1',
  }, SESSION_ID);
  assert.equal(result[0].kind, 'stream_end');

  assert.deepEqual(provider.normalizeMessage(null, SESSION_ID), []);
  assert.deepEqual(provider.normalizeMessage({ type: 'unknown' }, SESSION_ID), []);
  assert.deepEqual(provider.normalizeMessage({ kind: 'Prompt', data: null }, SESSION_ID), []);
});

test('Kiro history skips malformed lines and paginates from the tail', { concurrency: false }, async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'kiro-history-'));
  const restoreHomeDir = patchHomeDir(tempHome);
  const historyDirectory = path.join(tempHome, '.kiro', 'sessions', 'cli');
  await mkdir(historyDirectory, { recursive: true });

  const entries = [
    {
      kind: 'Prompt',
      data: {
        message_id: 'prompt-1',
        content: [{ kind: 'text', data: 'First prompt' }],
      },
    },
    {
      kind: 'AssistantMessage',
      data: {
        message_id: 'assistant-1',
        content: [
          { kind: 'text', data: 'First response' },
          {
            kind: 'toolUse',
            data: { toolUseId: 'tool-1', name: 'shell', input: { command: 'pwd' } },
          },
        ],
      },
    },
    {
      kind: 'ToolResults',
      data: {
        message_id: 'result-1',
        content: [{
          kind: 'toolResult',
          data: { toolUseId: 'tool-1', content: 'workspace', status: 'success' },
        }],
      },
    },
    {
      kind: 'Prompt',
      data: {
        message_id: 'prompt-2',
        content: [{ kind: 'text', data: 'Second prompt' }],
      },
    },
  ];

  try {
    await writeFile(
      path.join(historyDirectory, 'provider-session-1.jsonl'),
      `${entries.slice(0, 2).map((entry) => JSON.stringify(entry)).join('\n')}\n{not-json}\n`
        + `${entries.slice(2).map((entry) => JSON.stringify(entry)).join('\n')}\n`,
      'utf8',
    );

    const provider = new KiroSessionsProvider();
    const latest = await provider.fetchHistory(SESSION_ID, {
      providerSessionId: 'provider-session-1',
      limit: 2,
    });
    assert.equal(latest.total, 5);
    assert.equal(latest.hasMore, true);
    assert.deepEqual(
      latest.messages.map(({ id, kind }) => ({ id, kind })),
      [
        { id: 'result-1_0', kind: 'tool_result' },
        { id: 'prompt-2_0', kind: 'text' },
      ],
    );

    const previous = await provider.fetchHistory(SESSION_ID, {
      providerSessionId: 'provider-session-1',
      limit: 2,
      offset: 2,
    });
    assert.equal(previous.hasMore, true);
    assert.deepEqual(
      previous.messages.map(({ id, kind }) => ({ id, kind })),
      [
        { id: 'assistant-1_0', kind: 'text' },
        { id: 'assistant-1_1', kind: 'tool_use' },
      ],
    );

    const missing = await provider.fetchHistory(SESSION_ID, {
      providerSessionId: 'missing',
    });
    assert.deepEqual(missing.messages, []);
    assert.equal(missing.total, 0);

    await assert.rejects(
      provider.fetchHistory(SESSION_ID, { providerSessionId: '../outside' }),
      /Invalid Kiro session id/,
    );
  } finally {
    restoreHomeDir();
    await rm(tempHome, { recursive: true, force: true });
  }
});
