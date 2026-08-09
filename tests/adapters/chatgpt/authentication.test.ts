import { describe, expect, it } from 'vitest';

import { requireAuthenticatedChatGptSession } from '../../../src/adapters/chatgpt/authentication.js';
import type { BrowserPagePort, LocatorCandidate } from '../../../src/ports/browser-port.js';

describe('requireAuthenticatedChatGptSession', () => {
  it('waits for the authenticated UI to replace transient login markers', async () => {
    const page = new HydratingPage();
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

    expect(page.probes).toBeGreaterThanOrEqual(2);
  });
});

class HydratingPage implements BrowserPagePort {
  public probes = 0;
  private authenticated = false;

  public async goto(): Promise<void> {}

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    if (locator.kind === 'role' && locator.role === 'link' && locator.name === 'Log in') {
      this.authenticated = this.probes > 0;
      this.probes += 1;
      return !this.authenticated;
    }
    if (locator.kind === 'role' && locator.name === 'Log in') {
      return false;
    }
    if (locator.kind === 'css' && locator.value === '#prompt-textarea') {
      return this.authenticated;
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
