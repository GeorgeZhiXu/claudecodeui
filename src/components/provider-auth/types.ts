import type { LLMProvider } from '../../types/app';

export type ProviderAuthStatus = {
  authenticated: boolean;
  email: string | null;
  method: string | null;
  error: string | null;
  loading: boolean;
};

export type ProviderAuthStatusMap = Record<LLMProvider, ProviderAuthStatus>;

export const CLI_PROVIDERS: LLMProvider[] = ['claude', 'cursor', 'codex', 'gemini', 'kiro'];

export const CLI_AUTH_STATUS_ENDPOINTS: Record<LLMProvider, string> = {
  claude: '/api/cli/claude/status',
  cursor: '/api/cli/cursor/status',
  codex: '/api/cli/codex/status',
  gemini: '/api/cli/gemini/status',
  kiro: '/api/cli/kiro/status',
};

export const PROVIDER_AUTH_STATUS_ENDPOINTS: Record<LLMProvider, string> = {
  claude: '/api/providers/claude/auth/status',
  cursor: '/api/providers/cursor/auth/status',
  codex: '/api/providers/codex/auth/status',
  gemini: '/api/providers/gemini/auth/status',
  kiro: '/api/providers/kiro/auth/status',
};

export const createInitialProviderAuthStatusMap = (loading = true): ProviderAuthStatusMap => ({
  claude: { authenticated: false, email: null, method: null, error: null, loading },
  cursor: { authenticated: false, email: null, method: null, error: null, loading },
  codex: { authenticated: false, email: null, method: null, error: null, loading },
  gemini: { authenticated: false, email: null, method: null, error: null, loading },
  kiro: { authenticated: false, email: null, method: null, error: null, loading },
});

