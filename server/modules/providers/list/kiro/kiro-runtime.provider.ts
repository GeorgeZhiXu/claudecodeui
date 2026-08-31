import {
  disconnect,
  query,
  type KiroMessage,
  type Options as KiroSdkOptions,
  type Query,
} from 'kiro-sdk';
import { notifyRunFailed, notifyRunStopped } from '@/modules/notifications/index.js';
import type {
  AnyRecord,
  ProviderRuntimeContext,
  ProviderRuntimeWriter,
} from '@/shared/types.js';
import {
  createCompleteMessage,
  createNormalizedMessage,
  generateMessageId,
  readOptionalString,
} from '@/shared/utils.js';

type ActiveKiroRun = {
  abortController: AbortController;
  aborted: boolean;
  conversation: Query | null;
};

type KiroConversationResult = {
  result: Extract<KiroMessage, { type: 'result' }> | null;
  sawVisibleOutput: boolean;
  sessionId: string | null;
};

const activeKiroRuns = new Map<string, ActiveKiroRun>();

const sendNormalizedMessages = (
  writer: ProviderRuntimeWriter,
  context: ProviderRuntimeContext,
  message: KiroMessage,
  sessionId: string | null,
): void => {
  for (const normalized of context.normalizeMessage(message, sessionId)) {
    writer.send(normalized);
  }
};

async function streamKiroConversation(
  prompt: string,
  sdkOptions: KiroSdkOptions,
  run: ActiveKiroRun,
  writer: ProviderRuntimeWriter,
  context: ProviderRuntimeContext,
): Promise<KiroConversationResult> {
  const conversation = query({ prompt, options: sdkOptions });
  run.conversation = conversation;
  let result: KiroConversationResult['result'] = null;
  let sawVisibleOutput = false;
  let providerSessionId: string | null = sdkOptions.resume ?? null;

  for await (const message of conversation) {
    providerSessionId = conversation.sessionId ?? providerSessionId;
    if (providerSessionId) {
      writer.setSessionId?.(providerSessionId);
    }

    if (run.aborted) {
      break;
    }

    if (message.type === 'result') {
      result = message;
      break;
    }

    sawVisibleOutput = true;
    sendNormalizedMessages(writer, context, message, providerSessionId);
  }

  providerSessionId = conversation.sessionId ?? providerSessionId;
  if (providerSessionId) {
    writer.setSessionId?.(providerSessionId);
  }

  return { result, sawVisibleOutput, sessionId: providerSessionId };
}

async function runKiro(
  command: string,
  options: AnyRecord,
  writer: ProviderRuntimeWriter,
  context: ProviderRuntimeContext,
): Promise<void> {
  const appSessionId = readOptionalString(options.sessionId);
  const runKey = appSessionId ?? generateMessageId('kiro-run');
  const providerSessionId = context.resolveProviderSessionId(appSessionId);
  const requestedModel = readOptionalString(options.model);
  const resolvedModel = await context.resolveResumeModel(
    appSessionId ?? undefined,
    requestedModel,
  );
  const workingDirectory = readOptionalString(options.cwd)
    ?? readOptionalString(options.projectPath)
    ?? process.cwd();
  const abortController = new AbortController();
  const run: ActiveKiroRun = {
    abortController,
    aborted: false,
    conversation: null,
  };
  activeKiroRuns.set(runKey, run);

  const baseSdkOptions: KiroSdkOptions = {
    cwd: workingDirectory,
    model: resolvedModel === 'auto' ? undefined : resolvedModel,
    trustAllTools:
      options.permissionMode === 'bypassPermissions'
      || options.skipPermissions === true
      || process.env.KIRO_TRUST_ALL_TOOLS === 'true'
      || undefined,
    abortController,
  };

  try {
    let outcome = await streamKiroConversation(
      command.trim(),
      providerSessionId
        ? { ...baseSdkOptions, resume: providerSessionId }
        : baseSdkOptions,
      run,
      writer,
      context,
    );

    if (
      providerSessionId
      && outcome.result?.is_error
      && !outcome.sawVisibleOutput
      && !run.aborted
    ) {
      outcome = await streamKiroConversation(
        command.trim(),
        baseSdkOptions,
        run,
        writer,
        context,
      );
    }

    if (run.aborted) {
      return;
    }

    const finalSessionId = appSessionId ?? outcome.sessionId;
    if (outcome.result) {
      sendNormalizedMessages(writer, context, outcome.result, outcome.sessionId);
    }

    const exitCode = outcome.result?.is_error ? 1 : 0;
    if (exitCode !== 0 && !outcome.sawVisibleOutput) {
      writer.send(createNormalizedMessage({
        kind: 'error',
        provider: 'kiro',
        sessionId: outcome.sessionId,
        content: 'Kiro CLI could not complete the request.',
      }));
    }
    writer.send(createCompleteMessage({
      provider: 'kiro',
      sessionId: outcome.sessionId,
      exitCode,
    }));
    notifyRunStopped({
      userId: writer.userId ?? null,
      provider: 'kiro',
      sessionId: finalSessionId,
      sessionName: readOptionalString(options.sessionSummary),
      stopReason: exitCode === 0 ? 'completed' : 'error',
    });
  } catch (error) {
    if (run.aborted) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    writer.send(createNormalizedMessage({
      kind: 'error',
      provider: 'kiro',
      sessionId: appSessionId,
      content: `Failed to start Kiro: ${message}`,
    }));
    writer.send(createCompleteMessage({
      provider: 'kiro',
      sessionId: appSessionId,
      exitCode: 1,
    }));
    notifyRunFailed({
      userId: writer.userId ?? null,
      provider: 'kiro',
      sessionId: appSessionId,
      sessionName: readOptionalString(options.sessionSummary),
      error,
    });
    throw error;
  } finally {
    if (activeKiroRuns.get(runKey) === run) {
      activeKiroRuns.delete(runKey);
    }
  }
}

async function abortKiroSession(sessionId: string): Promise<boolean> {
  const run = activeKiroRuns.get(sessionId);
  if (!run) {
    return false;
  }

  run.aborted = true;
  run.abortController.abort();
  await run.conversation?.interrupt().catch(() => undefined);
  activeKiroRuns.delete(sessionId);
  return true;
}

process.once('exit', disconnect);

/** Runtime facet consumed by KiroProvider and the unified chat dispatcher. */
export const kiroRuntime = {
  run: runKiro,
  abort: abortKiroSession,
};
