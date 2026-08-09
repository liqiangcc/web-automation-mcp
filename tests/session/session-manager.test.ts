import { describe, expect, it } from 'vitest';

import type { SessionProbe, SessionStatus } from '../../src/ports/session-probe.js';
import { SessionManager } from '../../src/session/session-manager.js';

describe('SessionManager', () => {
  it('returns a configured terminal status without sleeping', async () => {
    const probe = new SequenceProbe(['AUTH_REQUIRED', 'AUTHENTICATED']);
    let sleeps = 0;

    const status = await new SessionManager(probe).waitForAuthenticated({
      timeoutMs: 60_000,
      pollIntervalMs: 250,
      terminalStatuses: ['AUTH_REQUIRED'],
      sleep: async () => {
        sleeps += 1;
      },
    });

    expect(status).toBe('AUTH_REQUIRED');
    expect(probe.checks).toBe(1);
    expect(sleeps).toBe(0);
  });

  it('preserves long-wait login behavior when no terminal status is configured', async () => {
    const probe = new SequenceProbe(['AUTH_REQUIRED', 'AUTHENTICATED']);
    let clock = 0;

    const status = await new SessionManager(probe).waitForAuthenticated({
      timeoutMs: 5_000,
      pollIntervalMs: 100,
      now: () => clock,
      sleep: async (delayMs) => {
        clock += delayMs;
      },
    });

    expect(status).toBe('AUTHENTICATED');
    expect(probe.checks).toBe(2);
    expect(clock).toBe(100);
  });
});

class SequenceProbe implements SessionProbe {
  public checks = 0;

  public constructor(private readonly statuses: readonly SessionStatus[]) {}

  public async check(): Promise<SessionStatus> {
    const status = this.statuses[Math.min(this.checks, this.statuses.length - 1)] ?? 'UNKNOWN';
    this.checks += 1;
    return status;
  }
}
