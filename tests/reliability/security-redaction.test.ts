import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ObservedAutomationApplication } from '../../src/application/observed-application.js';
import { WebAutomationError } from '../../src/domain/errors.js';
import type { DiagnosticsBundle, LifecycleEvent } from '../../src/domain/observability.js';
import { FileDiagnosticsBundleSink } from '../../src/infrastructure/observability.js';
import { toMcpToolError } from '../../src/mcp/tool-handlers.js';
import type { AutomationApplicationPort } from '../../src/ports/automation-application-port.js';
import type { DiagnosticsBundleSink, LifecycleSink } from '../../src/ports/observability-port.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('security and redaction', () => {
  it('does not expose raw operational error details through MCP', () => {
    const secret = 'cookie=session-secret-abc123 /home/private/profile';
    const result = toMcpToolError(new WebAutomationError('PROFILE_BUSY', secret));
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('session-secret-abc123');
    expect(serialized).not.toContain('/home/private/profile');
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: { code: 'PROFILE_BUSY' },
    });
  });

  it('keeps prompt, response, conversation id, and raw exception out of every observability sink', async () => {
    const lifecycle = new RecordingLifecycleSink();
    const diagnostics = new RecordingDiagnosticsSink();
    const secrets = {
      prompt: 'PROMPT_SECRET_123',
      response: 'RESPONSE_SECRET_456',
      conversationId: 'CONVERSATION_SECRET_789',
      exception: 'COOKIE_SECRET_ABC',
    };

    const inner: AutomationApplicationPort = {
      ask: async () => {
        throw new WebAutomationError('GENERATION_TIMEOUT', secrets.exception);
      },
      sessionStatus: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        status: 'AUTHENTICATED',
      }),
      newChat: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        status: 'READY',
      }),
      getLastResponse: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: request.conversationId,
        responseText: secrets.response,
      }),
    };

    const application = new ObservedAutomationApplication(inner, {
      lifecycle,
      diagnostics,
      createRequestId: () => 'safe-request-id',
    });

    await expect(
      application.ask({
        provider: 'chatgpt',
        profileId: 'default',
        prompt: secrets.prompt,
        conversationId: secrets.conversationId,
      }),
    ).rejects.toMatchObject({ code: 'GENERATION_TIMEOUT' });

    const serialized = JSON.stringify({ lifecycle: lifecycle.events, diagnostics: diagnostics.bundles });
    for (const secret of Object.values(secrets)) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain('GENERATION_TIMEOUT');
    expect(serialized).toContain('"hasConversationId":true');
  });

  it('writes diagnostics as a private file containing only the safe schema', async () => {
    const root = await mkdtemp(join(tmpdir(), 'web-automation-mcp-security-'));
    temporaryRoots.push(root);
    const sink = new FileDiagnosticsBundleSink(root);
    const bundle: DiagnosticsBundle = {
      version: 1,
      requestId: 'request-safe-1',
      operation: 'ask',
      timestamp: '2026-08-09T00:00:00.000Z',
      durationMs: 123,
      errorCode: 'TARGET_NOT_FOUND',
      provider: 'chatgpt',
      profileId: 'default',
      hasConversationId: true,
    };

    await sink.write(bundle);

    const diagnosticsDir = join(root, 'diagnostics');
    const files = await readdir(diagnosticsDir);
    expect(files).toEqual(['request-safe-1.json']);

    const filePath = join(diagnosticsDir, files[0] as string);
    const content = await readFile(filePath, 'utf8');
    expect(JSON.parse(content)).toEqual(bundle);
    expect(content).not.toMatch(/prompt|responseText|conversationId|cookie|token|stack/i);

    if (process.platform !== 'win32') {
      const fileStat = await stat(filePath);
      expect(fileStat.mode & 0o777).toBe(0o600);
    }
  });
});

class RecordingLifecycleSink implements LifecycleSink {
  public readonly events: LifecycleEvent[] = [];

  public async record(event: LifecycleEvent): Promise<void> {
    this.events.push(event);
  }
}

class RecordingDiagnosticsSink implements DiagnosticsBundleSink {
  public readonly bundles: DiagnosticsBundle[] = [];

  public async write(bundle: DiagnosticsBundle): Promise<void> {
    this.bundles.push(bundle);
  }
}
