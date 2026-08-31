import os from 'node:os';
import path from 'node:path';

import { McpProvider } from '@/modules/providers/shared/mcp/mcp.provider.js';
import type {
  McpScope,
  ProviderMcpServer,
  UpsertProviderMcpServerInput,
} from '@/shared/types.js';
import {
  AppError,
  readJsonConfig,
  readObjectRecord,
  readOptionalString,
  readStringArray,
  readStringRecord,
  writeJsonConfig,
} from '@/shared/utils.js';

const getKiroMcpPath = (scope: McpScope, workspacePath: string): string => (
  scope === 'user'
    ? path.join(os.homedir(), '.kiro', 'settings', 'mcp.json')
    : path.join(workspacePath, '.kiro', 'settings', 'mcp.json')
);

/** MCP facet used by provider MCP routes to manage Kiro's mcp.json files. */
export class KiroMcpProvider extends McpProvider {
  constructor() {
    super('kiro', ['user', 'project'], ['stdio']);
  }

  protected async readScopedServers(
    scope: McpScope,
    workspacePath: string,
  ): Promise<Record<string, unknown>> {
    const config = await readJsonConfig(getKiroMcpPath(scope, workspacePath));
    return readObjectRecord(config.mcpServers) ?? {};
  }

  protected async writeScopedServers(
    scope: McpScope,
    workspacePath: string,
    servers: Record<string, unknown>,
  ): Promise<void> {
    const filePath = getKiroMcpPath(scope, workspacePath);
    const config = await readJsonConfig(filePath);
    config.mcpServers = servers;
    await writeJsonConfig(filePath, config);
  }

  protected buildServerConfig(input: UpsertProviderMcpServerInput): Record<string, unknown> {
    if (!input.command?.trim()) {
      throw new AppError('command is required for Kiro MCP servers.', {
        code: 'MCP_COMMAND_REQUIRED',
        statusCode: 400,
      });
    }

    return {
      command: input.command,
      args: input.args ?? [],
      env: input.env ?? {},
    };
  }

  protected normalizeServerConfig(
    scope: McpScope,
    name: string,
    rawConfig: unknown,
  ): ProviderMcpServer | null {
    const config = readObjectRecord(rawConfig);
    const command = readOptionalString(config?.command);
    if (!command) {
      return null;
    }

    return {
      provider: 'kiro',
      name,
      scope,
      transport: 'stdio',
      command,
      args: readStringArray(config?.args),
      env: readStringRecord(config?.env),
    };
  }
}
