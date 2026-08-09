import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import type { DiagnosticsBundle, LifecycleEvent } from '../domain/observability.js';
import type { DiagnosticsBundleSink, LifecycleSink } from '../ports/observability-port.js';

export class JsonLineLifecycleSink implements LifecycleSink {
  public async record(event: LifecycleEvent): Promise<void> {
    process.stderr.write(`${JSON.stringify(event)}\n`);
  }
}

export class FileDiagnosticsBundleSink implements DiagnosticsBundleSink {
  private readonly diagnosticsDir: string;

  public constructor(rootDir = process.env.WEB_AUTOMATION_MCP_HOME ?? join(homedir(), '.web-automation-mcp')) {
    this.diagnosticsDir = resolve(rootDir, 'diagnostics');
  }

  public async write(bundle: DiagnosticsBundle): Promise<void> {
    await mkdir(this.diagnosticsDir, { recursive: true });
    const fileName = `${safeFileSegment(bundle.requestId)}.json`;
    await writeFile(join(this.diagnosticsDir, fileName), `${JSON.stringify(bundle, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
  }
}

function safeFileSegment(value: string): string {
  const sanitized = value.replaceAll(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
  return sanitized.length > 0 ? sanitized : 'request';
}
