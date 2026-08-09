import { describe, expect, it } from 'vitest';

import { requireAuthenticatedChatGptSession } from '../../src/adapters/chatgpt/authentication.js';
import {
  ChatGptCompletionDetector,
  createFallbackWakeupSource,
} from '../../src/adapters/chatgpt/completion-detector.js';
import type { CompletionSnapshot } from '../../src/adapters/chatgpt/completion-snapshot.js';
import { ChatGptConversationNavigator } from '../../src/adapters/chatgpt/conversation-navigator.js';
import { ChatGptPlainTextResponseExtractor } from '../../src/adapters/chatgpt/response-extractor.js';
import { ChatGptTargetResolver } from '../../src/adapters/chatgpt/target-resolver.js';
import type { BrowserPagePort, LocatorCandidate } from '../../src/ports/browser-port.js';

describe('failure classification matrix', () => {
  it('classifies browser navigation failures as NAVIGATION_FAILED', async () => {
    const page = new FailurePage({ gotoError: new Error('network reset') });

    await expect(new ChatGptConversationNavigator(page).open()).rejects.toMatchObject({
      code: 'NAVIGATION_FAILED',
    });
  });

  it('classifies an explicit login page as AUTH_REQUIRED', async () => {
    const page = new FailurePage({ visible: (locator) => isLogin(locator) });

    await expect(requireAuthenticatedChatGptSession(page, { timeoutMs: 0 })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('classifies an unrecognized provider page as PROVIDER_UNAVAILABLE', async () => {
    const page = new FailurePage({ visible: () => false });

    await expect(requireAuthenticatedChatGptSession(page, { timeoutMs: 0 })).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });

  it('classifies exhausted required locator candidates as TARGET_NOT_FOUND', async () => {
    const page = new FailurePage({ visible: () => false });

    await expect(new ChatGptTargetResolver(page).require('prompt-input')).rejects.toMatchObject({
      code: 'TARGET_NOT_FOUND',
    });
  });

  it('classifies a response that never starts as RESPONSE_START_TIMEOUT', async () => {
    let now = 0;
    const dependencies = {
      now: () => now,
      sleep: async (delayMs: number) => {
        now += delayMs;
      },
    };
    const emptySnapshot: CompletionSnapshot = {
      responses: [],
      responsePresent: false,
      generating: false,
      composerReady: true,
    };
    const detector = new ChatGptCompletionDetector(
      { read: async () => emptySnapshot },
      createFallbackWakeupSource(dependencies),
      {
        startTimeoutMs: 20,
        absoluteTimeoutMs: 100,
        watchdogIntervalMs: 10,
        fastSettleMs: 0,
        fallbackSettleMs: 0,
      },
      dependencies,
    );

    await expect(detector.waitForCompletion()).rejects.toMatchObject({
      code: 'RESPONSE_START_TIMEOUT',
    });
  });

  it('classifies a missing post-baseline response as EXTRACTION_FAILED', () => {
    expect(() => new ChatGptPlainTextResponseExtractor().extract([], { count: 0 })).toThrowError(
      expect.objectContaining({ code: 'EXTRACTION_FAILED' }),
    );
  });

  it('classifies missing conversation URL capability as PROVIDER_CHANGED', () => {
    const page = new FailurePage();

    expect(() => new ChatGptConversationNavigator(page).currentConversationId()).toThrowError(
      expect.objectContaining({ code: 'PROVIDER_CHANGED' }),
    );
  });
});

interface FailurePageOptions {
  readonly gotoError?: Error;
  readonly visible?: (locator: LocatorCandidate) => boolean;
}

class FailurePage implements BrowserPagePort {
  public constructor(private readonly options: FailurePageOptions = {}) {}

  public async goto(): Promise<void> {
    if (this.options.gotoError !== undefined) {
      throw this.options.gotoError;
    }
  }

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    return this.options.visible?.(locator) ?? false;
  }

  public async fill(): Promise<void> {}
  public async click(): Promise<void> {}
  public async press(): Promise<void> {}

  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}

function isLogin(locator: LocatorCandidate): boolean {
  return (
    locator.kind === 'role' &&
    (locator.role === 'link' || locator.role === 'button') &&
    locator.name === 'Log in'
  );
}
