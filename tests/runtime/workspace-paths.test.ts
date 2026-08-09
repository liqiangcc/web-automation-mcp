import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveWorkspacePaths } from '../../src/runtime/workspace-paths.js';

describe('resolveWorkspacePaths', () => {
  it('uses the MCP startup cwd as the zero-config workspace and input root', () => {
    const startupCwd = join(process.cwd(), 'workspace-test-project');

    expect(resolveWorkspacePaths(startupCwd, {})).toEqual({
      workspaceRoot: resolve(startupCwd),
      inputRoot: resolve(startupCwd),
      outputRoot: resolve(startupCwd, 'mcp-output'),
    });
  });

  it('resolves a workspace override relative to the startup cwd', () => {
    const startupCwd = join(process.cwd(), 'repos', 'project-a');
    const workspaceRoot = resolve(startupCwd, '../shared-project');

    expect(
      resolveWorkspacePaths(startupCwd, {
        WEB_AUTOMATION_MCP_WORKSPACE: '../shared-project',
      }),
    ).toEqual({
      workspaceRoot,
      inputRoot: workspaceRoot,
      outputRoot: resolve(workspaceRoot, 'mcp-output'),
    });
  });

  it('lets input and output roots override workspace defaults independently', () => {
    const startupCwd = join(process.cwd(), 'repos', 'project-b');
    const workspaceRoot = resolve(startupCwd, 'workspace');

    expect(
      resolveWorkspacePaths(startupCwd, {
        WEB_AUTOMATION_MCP_WORKSPACE: 'workspace',
        WEB_AUTOMATION_MCP_INPUT_ROOT: 'allowed-inputs',
        WEB_AUTOMATION_MCP_OUTPUT_ROOT: '../generated-output',
      }),
    ).toEqual({
      workspaceRoot,
      inputRoot: resolve(workspaceRoot, 'allowed-inputs'),
      outputRoot: resolve(workspaceRoot, '../generated-output'),
    });
  });

  it('preserves absolute input/output override compatibility', () => {
    const startupCwd = join(process.cwd(), 'repos', 'project-c');
    const inputRoot = resolve(process.cwd(), 'explicit-input-root');
    const outputRoot = resolve(process.cwd(), 'explicit-output-root');

    expect(
      resolveWorkspacePaths(startupCwd, {
        WEB_AUTOMATION_MCP_INPUT_ROOT: inputRoot,
        WEB_AUTOMATION_MCP_OUTPUT_ROOT: outputRoot,
      }),
    ).toEqual({
      workspaceRoot: resolve(startupCwd),
      inputRoot,
      outputRoot,
    });
  });

  it('treats blank path environment variables as unset', () => {
    const startupCwd = join(process.cwd(), 'workspace-test-blank');

    expect(
      resolveWorkspacePaths(startupCwd, {
        WEB_AUTOMATION_MCP_WORKSPACE: '   ',
        WEB_AUTOMATION_MCP_INPUT_ROOT: '',
        WEB_AUTOMATION_MCP_OUTPUT_ROOT: '  ',
      }),
    ).toEqual({
      workspaceRoot: resolve(startupCwd),
      inputRoot: resolve(startupCwd),
      outputRoot: resolve(startupCwd, 'mcp-output'),
    });
  });
});
