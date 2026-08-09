import { describe, expect, it } from 'vitest';

import { requireAuthenticatedChatGptSession } from '../../../src/adapters/chatgpt/authentication.js';
import type { BrowserPagePort, LocatorCandidate } from '../../../src/ports/browser-port.js';

describe('requireAuthenticatedChatGptSession', () => {
  it('retries UNKNOWN while the authenticated UI stabilizes', async () => {
    const page = new UnknownThenAuthenticatedPage();
    let clock = 0;

    await expect(
      requireAuthenticatedChatGptSession(page, {
        timeoutMs: 1_000,
        pollIntervalMs: 100,
        now: () => clock,
        sleep: async (delayMs) => {
          clock += delayMs;
        },
      }),
    ).resolves.toBeUndefined();

    expect(page.probeRounds).toBeGreaterThanOrEqual(2);
    expect(clock).toBe(100);
  });

  it('fails immediately when the page explicitly requires authentication', async () => {
    const page = new AuthRequiredPage();
    let sleeps = 0;

    await expect(
      requireAuthenticatedChatGptSession(page, {
        timeoutMs: 60_000,
        pollIntervalMs: 250,
        sleep: async () => {
          sleeps += 1;
        },
      }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });

    expect(page.probes).toBe(1);
    expect(sleeps).toBe(0);
  });

  it('classifies persistent UNKNOWN as provider unavailable after the bounded stabilization window', async () => {
    const page = new UnknownPage();
    let clock = 0;

    await expect(
      requireAuthenticatedChatGptSession(page, {
        timeoutMs: 500,
        pollIntervalMs: 100,
        now: () => clock,
        sleep: async (delayMs) => {
          clock += delayMs;
        },
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });

    expect(clock).toBe(500);
  });
});

class UnknownThenAuthenticatedPage implements BrowserPagePort {
  public probeRounds = 0;
  private callsInRound = 0;
  private authenticated = false;

  public async goto(): Promise<void> {}

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    this.callsInRound += 1;
    if (!this.authenticated && this.callsInRound >= 7) {
      this.probeRounds += 1;
      this.callsInRound = 0;
      this.authenticated = true;
      return false;
    }

    if (
      this.authenticated &&
      locator.kind === 'role' &&
      locator.role === 'textbox' &&
      locator.name === 'Message ChatGPT'
    ) {
      this.probeRounds += 1;
      return true;
    }

    return false;
  }

  public async fill(): Promise<void> {}
  public async click(): Promise<void> {}
  public async press(): Promise<void> {}
  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}

class AuthRequiredPage implements BrowserPagePort {
  public probes = 0;

  public async goto(): Promise<void> {}

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    if (locator.kind === 'css' && locator.value === '#modal-no-auth-login') {
      this.probes += 1;
      return true;
    }
    return false;
  }

  public async fill(): Promise<void> {}
  public async click(): Promise<void> {}
  public async press(): Promise<void> {}
  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}

class UnknownPage implements BrowserPagePort {
  public async goto(): Promise<void> {}
  public async isVisible(): Promise<boolean> {
    return false;
  }
  public async fill(): Promise<void> {}
  public async click(): Promise<void> {}
  public async press(): Promise<void> {}
  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}
