import { describe, expect, it } from 'vitest';

import { ChatGptConversationProvider } from '../../src/providers/chatgpt-conversation-provider.js';
import type { BrowserPagePort, LocatorCandidate } from '../../src/ports/browser-port.js';
import type { BrowserSession, BrowserSessionPort } from '../../src/ports/browser-session-port.js';

class FakePage implements BrowserPagePort {
  public current = 'about:blank';
  public readonly navigations: string[] = [];

  public async goto(url: string): Promise<void> {
    this.current = url;
    this.navigations.push(url);
  }

  public currentUrl(): string {
    return this.current;
  }

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    if (locator.kind === 'role' && locator.name === 'Log in') {
      return false;
    }
    if (locator.kind === 'role' && locator.role === 'textbox') {
      return true;
    }
    if (locator.kind === 'css' && locator.value.includes('assistant')) {
      return true;
    }
    return false;
  }

  public async fill(): Promise<void> {}
  public async click(): Promise<void> {}
  public async press(): Promise<void> {}

  public async textContents(locator: LocatorCandidate): Promise<readonly string[]> {
    if (locator.kind === 'css' && locator.value.includes('assistant')) {
      return ['first answer', 'latest answer'];
    }
    return [];
  }
}

class FakeSessions implements BrowserSessionPort {
  public readonly page = new FakePage();
  public closed = 0;

  public async acquire(): Promise<BrowserSession> {
    return {
      page: this.page,
      close: async () => {
        this.closed += 1;
      },
    };
  }
}

describe('ChatGptConversationProvider', () => {
  it('opens a fresh authenticated chat without inventing a conversation id', async () => {
    const sessions = new FakeSessions();
    const provider = new ChatGptConversationProvider(sessions);

    await expect(provider.newChat('default')).resolves.toEqual({ status: 'READY' });
    expect(sessions.page.navigations).toEqual(['https://chatgpt.com/']);
    expect(sessions.closed).toBe(1);
  });

  it('opens an existing conversation and returns its latest assistant response', async () => {
    const sessions = new FakeSessions();
    const provider = new ChatGptConversationProvider(sessions);

    await expect(
      provider.getLastResponse({ profileId: 'default', conversationId: 'conversation-1' }),
    ).resolves.toEqual({ responseText: 'latest answer' });
    expect(sessions.page.navigations).toEqual(['https://chatgpt.com/c/conversation-1']);
    expect(sessions.closed).toBe(1);
  });
});
