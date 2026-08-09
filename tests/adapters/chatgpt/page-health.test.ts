import { describe, expect, it } from 'vitest';

import { ChatGptPageHealthProbe } from '../../../src/adapters/chatgpt/page-health.js';
import type { BrowserPagePort, LocatorCandidate } from '../../../src/ports/browser-port.js';

describe('ChatGptPageHealthProbe', () => {
  it('classifies rate limiting from status regions even when the composer is present', async () => {
    const page = new HealthPage({
      composerVisible: true,
      statusText: 'Too many requests. Try again later.',
      bodyText: 'normal page',
    });

    await expect(new ChatGptPageHealthProbe(page).check()).resolves.toBe('RATE_LIMITED');
  });

  it('does not classify ordinary conversation text as rate limiting when the composer is healthy', async () => {
    const page = new HealthPage({
      composerVisible: true,
      bodyText: 'The user asked what a rate limit means.',
    });

    await expect(new ChatGptPageHealthProbe(page).check()).resolves.toBe('HEALTHY');
    expect(page.bodyReads).toBe(0);
  });

  it('uses whole-page text only when the normal composer is absent', async () => {
    const page = new HealthPage({
      composerVisible: false,
      bodyText: '访问过于频繁，请稍后再试',
    });

    await expect(new ChatGptPageHealthProbe(page).check()).resolves.toBe('RATE_LIMITED');
    expect(page.bodyReads).toBe(1);
  });

  it('classifies provider error surfaces separately from rate limiting', async () => {
    const page = new HealthPage({
      composerVisible: false,
      statusText: 'Unable to load conversation history',
    });

    await expect(new ChatGptPageHealthProbe(page).check()).resolves.toBe('PROVIDER_ERROR');
  });
});

interface HealthPageOptions {
  readonly composerVisible: boolean;
  readonly statusText?: string;
  readonly bodyText?: string;
}

class HealthPage implements BrowserPagePort {
  public bodyReads = 0;

  public constructor(private readonly options: HealthPageOptions) {}

  public async goto(): Promise<void> {}

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    return (
      this.options.composerVisible &&
      locator.kind === 'role' &&
      locator.role === 'textbox' &&
      locator.name === 'Message ChatGPT'
    );
  }

  public async textContents(locator: LocatorCandidate): Promise<readonly string[]> {
    if (locator.kind !== 'css') {
      return [];
    }
    if (locator.value === 'body') {
      this.bodyReads += 1;
      return this.options.bodyText === undefined ? [] : [this.options.bodyText];
    }
    if (locator.value.includes('[role="alert"]')) {
      return this.options.statusText === undefined ? [] : [this.options.statusText];
    }
    return [];
  }

  public async fill(): Promise<void> {}
  public async click(): Promise<void> {}
  public async press(): Promise<void> {}
}
