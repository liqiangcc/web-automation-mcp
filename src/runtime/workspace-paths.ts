import { resolve } from 'node:path';

export interface WorkspacePathEnvironment {
  readonly WEB_AUTOMATION_MCP_WORKSPACE?: string;
  readonly WEB_AUTOMATION_MCP_INPUT_ROOT?: string;
  readonly WEB_AUTOMATION_MCP_OUTPUT_ROOT?: string;
}

export interface WorkspacePaths {
  readonly workspaceRoot: string;
  readonly inputRoot: string;
  readonly outputRoot: string;
}

export function resolveWorkspacePaths(
  startupCwd: string,
  env: WorkspacePathEnvironment,
): WorkspacePaths {
  const startupRoot = resolve(startupCwd);
  const workspaceRoot = resolve(
    startupRoot,
    configuredPath(env.WEB_AUTOMATION_MCP_WORKSPACE) ?? '.',
  );
  const inputRoot = resolve(
    workspaceRoot,
    configuredPath(env.WEB_AUTOMATION_MCP_INPUT_ROOT) ?? '.',
  );
  const outputRoot = resolve(
    workspaceRoot,
    configuredPath(env.WEB_AUTOMATION_MCP_OUTPUT_ROOT) ?? 'mcp-output',
  );

  return {
    workspaceRoot,
    inputRoot,
    outputRoot,
  };
}

function configuredPath(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value;
}
