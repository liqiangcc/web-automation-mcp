import { describe, expect, it } from 'vitest';

import { ChatGptConversationNavigator } from '../../../src/adapters/chatgpt/conversation-navigator.js';
import type { BrowserPagePort } from '../../../src/ports/browser-port.js';

describe('ChatGptConversationNavigator', () => {
  it('opens a new chat when no conversation id is supplied', async () => {
    const page = new FakePage();
    await new ChatGptConversationNavigator(page).open();
    expect(page.visited).toBe('https://chatgpt.com/');
  });

  it('opens an existing conversation and URL-encodes its id', async () => {
    const page = new FakePage();
    await new ChatGptConversationNavigator(page).open('abc/123');
    expect(page.visited).toBe('https://chatgpt.com/c/abc%2F123');
  });

  it('captures the actual conversation id from the current ChatGPT URL', () => {
    const page = new FakePage('https://chatgpt.com/c/123e4567-e89b-12d3-a456-426614174000');
    expect(new ChatGptConversationNavigator(page).currentConversationId()).toBe(
      '123e4567-e89b-12d3-a456-426614174000',
    );
  });

  it('fails explicitly when no conversation handle can be captured', () => {
    const page = new FakePage('https://chatgpt.com/');
    expect(() => new ChatGptConversationNavigator(page).currentConversationId()).toThrowError(
      expect.objectContaining({ code: 'EXTRACTION_FAILED' }),
    );
  });
});

class FakePage implements BrowserPagePort {
  public visited: string | undefined;

  public constructor(private readonly url = 'https://chatgpt.com/') {}

  public async goto(url: string): Promise<void> {
    this.visited = url;
  }

  public currentUrl(): string {
    return this.url;
  }

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
