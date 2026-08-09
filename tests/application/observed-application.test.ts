import { describe, expect, it } from 'vitest';

import { ObservedAutomationApplication } from '../../src/application/observed-application.js';
import { WebAutomationError } from '../../src/domain/errors.js';
import type { DiagnosticsBundle, LifecycleEvent } from '../../src/domain/observability.js';
import type { AutomationApplicationPort } from '../../src/ports/automation-application-port.js';
import type { DiagnosticsBundleSink, LifecycleSink } from '../../src/ports/observability-port.js';

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

describe('ObservedAutomationApplication', () => {
  it('logs safe request lifecycle metadata without prompt or response content', async () => {
    const lifecycle = new RecordingLifecycleSink();
    const diagnostics = new RecordingDiagnosticsSink();
    let clock = 1_000;
    const application = new ObservedAutomationApplication(createApplication(), {
      lifecycle,
      diagnostics,
      createRequestId: () => 'request-1',
      now: () => new Date((clock += 25)),
    });

    const result = await application.ask({
      provider: 'chatgpt',
      profileId: 'default',
      prompt: 'secret prompt text',
      conversationId: 'secret-conversation-id',
    });

    expect(result.responseText).toBe('secret response text');
    expect(lifecycle.events).toHaveLength(2);
    expect(lifecycle.events[0]).toMatchObject({
      requestId: 'request-1',
      operation: 'ask',
      phase: 'START',
      provider: 'chatgpt',
      profileId: 'default',
      hasConversationId: true,
    });
    expect(lifecycle.events[1]).toMatchObject({
      operation: 'ask',
      phase: 'SUCCESS',
      durationMs: 25,
    });

    const serialized = JSON.stringify(lifecycle.events);
    expect(serialized).not.toContain('secret prompt text');
    expect(serialized).not.toContain('secret response text');
    expect(serialized).not.toContain('secret-conversation-id');
    expect(diagnostics.bundles).toEqual([]);
  });

  it('writes a sanitized diagnostics bundle for typed operational failures', async () => {
    const lifecycle = new RecordingLifecycleSink();
    const diagnostics = new RecordingDiagnosticsSink();
    const inner = createApplication({
      ask: async () => {
        throw new WebAutomationError(
          'PROFILE_BUSY',
          'Profile lock is held at /home/private/.web-automation-mcp/locks/secret.lock',
        );
      },
    });
    let clock = 2_000;
    const application = new ObservedAutomationApplication(inner, {
      lifecycle,
      diagnostics,
      createRequestId: () => 'request-2',
      now: () => new Date((clock += 10)),
    });

    await expect(
      application.ask({ provider: 'chatgpt', profileId: 'default', prompt: 'private prompt' }),
    ).rejects.toMatchObject({ code: 'PROFILE_BUSY' });

    expect(diagnostics.bundles).toEqual([
      {
        version: 1,
        requestId: 'request-2',
        operation: 'ask',
        timestamp: new Date(2_020).toISOString(),
        durationMs: 10,
        errorCode: 'PROFILE_BUSY',
        provider: 'chatgpt',
        profileId: 'default',
        hasConversationId: false,
      },
    ]);
    const serialized = JSON.stringify(diagnostics.bundles);
    expect(serialized).not.toContain('/home/private');
    expect(serialized).not.toContain('private prompt');
  });

  it('classifies unknown failures without exposing the original exception', async () => {
    const lifecycle = new RecordingLifecycleSink();
    const diagnostics = new RecordingDiagnosticsSink();
    const inner = createApplication({
      newChat: async () => {
        throw new Error('secret cookie abc123');
      },
    });
    const application = new ObservedAutomationApplication(inner, {
      lifecycle,
      diagnostics,
      createRequestId: () => 'request-3',
    });

    await expect(
      application.newChat({ provider: 'chatgpt', profileId: 'default' }),
    ).rejects.toThrow('secret cookie abc123');

    expect(diagnostics.bundles[0]?.errorCode).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(diagnostics.bundles)).not.toContain('abc123');
  });

  it('never lets observability failures change a successful business result', async () => {
    const application = new ObservedAutomationApplication(createApplication(), {
      lifecycle: {
        record: async () => {
          throw new Error('logger unavailable');
        },
      },
      diagnostics: {
        write: async () => {
          throw new Error('disk unavailable');
        },
      },
    });

    await expect(
      application.sessionStatus({ provider: 'chatgpt', profileId: 'default' }),
    ).resolves.toMatchObject({ status: 'AUTHENTICATED' });
  });
});

function createApplication(
  overrides: Partial<AutomationApplicationPort> = {},
): AutomationApplicationPort {
  return {
    ask:
      overrides.ask ??
      (async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: request.conversationId ?? 'conversation-1',
        responseText: 'secret response text',
      })),
    askToFile:
      overrides.askToFile ??
      (async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: request.conversationId ?? 'conversation-1',
        filePath: '/safe/output/answer.md',
        bytesWritten: 20,
        sha256: 'safe-hash',
      })),
    sessionStatus:
      overrides.sessionStatus ??
      (async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        status: 'AUTHENTICATED' as const,
      })),
    newChat:
      overrides.newChat ??
      (async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        status: 'READY' as const,
      })),
    getLastResponse:
      overrides.getLastResponse ??
      (async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: request.conversationId,
        responseText: 'secret response text',
      })),
  };
}
