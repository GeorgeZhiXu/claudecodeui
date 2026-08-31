import { AbstractProvider } from '@/modules/providers/shared/base/abstract.provider.js';
import type {
  IProviderAuth,
  IProviderModels,
  IProviderRuntime,
  IProviderSessionSynchronizer,
  IProviderSkills,
  IProviderSessions,
} from '@/shared/interfaces.js';

import { KiroProviderAuth } from './kiro-auth.provider.js';
import { KiroProviderModels } from './kiro-models.provider.js';
import { kiroRuntime } from './kiro-runtime.provider.js';
import { KiroMcpProvider } from './kiro-mcp.provider.js';
import { KiroSessionSynchronizer } from './kiro-session-synchronizer.provider.js';
import { KiroSessionsProvider } from './kiro-sessions.provider.js';
import { KiroSkillsProvider } from './kiro-skills.provider.js';

/** Provider registry entry that assembles Kiro's runtime and supporting facets. */
export class KiroProvider extends AbstractProvider {
  readonly runtime: IProviderRuntime = kiroRuntime;
  readonly models: IProviderModels = new KiroProviderModels();
  readonly mcp = new KiroMcpProvider();
  readonly auth: IProviderAuth = new KiroProviderAuth();
  readonly skills: IProviderSkills = new KiroSkillsProvider();
  readonly sessions: IProviderSessions = new KiroSessionsProvider();
  readonly sessionSynchronizer: IProviderSessionSynchronizer = new KiroSessionSynchronizer();

  constructor() {
    super('kiro');
  }
}
