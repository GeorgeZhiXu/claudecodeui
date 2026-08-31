import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { IProviderModels } from '@/shared/interfaces.js';
import type {
  ProviderCurrentActiveModel,
  ProviderModelsDefinition,
} from '@/shared/types.js';
import {
  buildDefaultProviderCurrentActiveModel,
  readObjectRecord,
  readOptionalString,
} from '@/shared/utils.js';

/** Curated Kiro catalog retained from the fork's original Kiro integration. */
export const KIRO_PREDEFINED_MODELS: ProviderModelsDefinition = {
  OPTIONS: [
    { value: 'auto', label: 'Auto' },
    { value: 'claude-opus-4.6', label: 'Claude Opus 4.6' },
    { value: 'claude-opus-4.6-1m', label: 'Claude Opus 4.6 (1M)' },
    { value: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-sonnet-4.6-1m', label: 'Claude Sonnet 4.6 (1M)' },
    { value: 'claude-opus-4.5', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
    { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
    { value: 'claude-haiku-4.5', label: 'Claude Haiku 4.5' },
    { value: 'deepseek-3.2', label: 'DeepSeek 3.2' },
    { value: 'minimax-m2.5', label: 'MiniMax M2.5' },
    { value: 'glm-5', label: 'GLM-5' },
  ],
  DEFAULT: 'auto',
};

const KIRO_CLI_SETTINGS_PATH = path.join(os.homedir(), '.kiro', 'settings', 'cli.json');

/** Model facet used by provider model routes and Kiro runtime resume handling. */
export class KiroProviderModels implements IProviderModels {
  async getSupportedModels(): Promise<ProviderModelsDefinition> {
    return KIRO_PREDEFINED_MODELS;
  }

  async getCurrentActiveModel(): Promise<ProviderCurrentActiveModel> {
    try {
      const content = await readFile(KIRO_CLI_SETTINGS_PATH, 'utf8');
      const settings = readObjectRecord(JSON.parse(content));
      const model = readOptionalString(settings?.['chat.defaultModel']);
      return model
        ? { model }
        : buildDefaultProviderCurrentActiveModel(KIRO_PREDEFINED_MODELS);
    } catch {
      return buildDefaultProviderCurrentActiveModel(KIRO_PREDEFINED_MODELS);
    }
  }
}
