import { describe, expect, it } from 'vitest';

import { ChatGptHistoryDiagnostic } from '../../../src/adapters/chatgpt/history-diagnostic.js';
import type {
  BrowserElementSnapshot,
  BrowserPagePort,
  LocatorCandidate,
} from '../../../src/ports/browser-port.js';

class DiagnosticPage implements BrowserPagePort {
  public constructor(
    private readonly options: {
      readonly promptVisible?: boolean;
      readonly conversationLocatorExists?: boolean;
      readonly statusText?: string;
      readonly snapshots?: readonly BrowserElementSnapshot[];
    },
  ) {}

  public async goto(): Promise<void> {}

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    return isPrompt(locator) ? (this.options.promptVisible ?? false) : false;
  }

  public async exists(locator: LocatorCandidate): Promise<boolean> {
    return isConversationLink(locator) ? (this.options.conversationLocatorExists ?? false) : false;
  }

  public async elementSnapshots(): Promise<readonly BrowserElementSnapshot[]> {
    return this.options.snapshots ?? [];
  }

  public async fill(): Promise<void> {}
  public async click(): Promise<void> {}
  public async press(): Promise<void> {}

  public async textContents(locator: LocatorCandidate): Promise<readonly string[]> {
    if (isStatusRegion(locator) && this.options.statusText !== undefined) {
      return [this.options.statusText];
    }
    return [];
  }
}

function snapshot(href?: string): BrowserElementSnapshot {
  return {
    text: 'SECRET_TITLE_THAT_MUST_NOT_BE_REPORTED',
    attributes: { href: href ?? null },
  };
}

describe('ChatGptHistoryDiagnostic', () => {
  it('reports only aggregate href shapes for a healthy history page', async () => {
    const result = await new ChatGptHistoryDiagnostic(
      new DiagnosticPage({
        promptVisible: true,
        conversationLocatorExists: true,
        snapshots: [
          snapshot('/c/secret-relative-id'),
          snapshot('https://chatgpt.com/c/secret-absolute-id'),
          snapshot('https://example.com/not-a-conversation'),
          snapshot(),
        ],
      }),
    ).inspect();

    expect(result).toEqual({
      pageHealth: 'HEALTHY',
      conversationLocatorFound: true,
      matchedElementCount: 4,
      relativeHrefCount: 1,
      absoluteChatGptHrefCount: 1,
      otherHrefCount: 1,
      missingHrefCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain('secret-relative-id');
    expect(JSON.stringify(result)).not.toContain('secret-absolute-id');
    expect(JSON.stringify(result)).not.toContain('SECRET_TITLE');
  });

  it('reports rate limiting without requiring a conversation locator', async () => {
    const result = await new ChatGptHistoryDiagnostic(
      new DiagnosticPage({
        statusText: 'Too many requests. Please try again later.',
        conversationLocatorExists: false,
      }),
    ).inspect();

    expect(result).toEqual({
      pageHealth: 'RATE_LIMITED',
      conversationLocatorFound: false,
      matchedElementCount: 0,
      relativeHrefCount: 0,
      absoluteChatGptHrefCount: 0,
      otherHrefCount: 0,
      missingHrefCount: 0,
    });
  });
});

function isPrompt(locator: LocatorCandidate): boolean {
  return (
    locator.kind === 'role' &&
    locator.role === 'textbox' &&
    locator.name === 'Message ChatGPT'
  );
}

function isConversationLink(locator: LocatorCandidate): boolean {
  return locator.kind === 'css' && locator.value.includes('href');
}

function isStatusRegion(locator: LocatorCandidate): boolean {
  return locator.kind === 'css' && locator.value.includes('[role="alert"]');
}
