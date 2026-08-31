import spawn from 'cross-spawn';

import type { IProviderAuth } from '@/shared/interfaces.js';
import type { ProviderAuthStatus } from '@/shared/types.js';

const getKiroExecutable = (): string => process.env.KIRO_PATH?.trim() || 'kiro-cli';

/** Auth facet used by provider status routes to probe the local Kiro CLI account. */
export class KiroProviderAuth implements IProviderAuth {
  async getStatus(): Promise<ProviderAuthStatus> {
    const executable = getKiroExecutable();
    const versionResult = spawn.sync(executable, ['--version'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const installed = !versionResult.error && versionResult.status === 0;

    if (!installed) {
      return {
        installed: false,
        provider: 'kiro',
        authenticated: false,
        email: null,
        method: null,
        error: 'Kiro CLI is not installed',
      };
    }

    const accountResult = spawn.sync(executable, ['whoami'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const authenticated = !accountResult.error && accountResult.status === 0;
    const error = accountResult.error?.message
      || accountResult.stderr?.trim()
      || (authenticated ? undefined : 'Kiro CLI is not logged in');

    return {
      installed: true,
      provider: 'kiro',
      authenticated,
      email: authenticated ? 'Kiro CLI account' : null,
      method: authenticated ? 'cli' : null,
      error,
    };
  }
}
