import { describe, expect, it } from 'vitest';

import { ChatGptConversationReader } from '../../../src/adapters/chatgpt/conversation-reader.js';
import { WebAutomationError } from '../../../src/domain/errors.js';
import type {
  BrowserElementSnapshot,
  BrowserPagePort,
  DomChangeWaitResult,
} from '../../../src/ports/browser-port.js';

class FakePage implements BrowserPagePort {
  private readIndex = 0;
  public scrolls = 0;

  public constructor(
    private readonly url: string,
    private readonly reads: readonly (readonly BrowserElementSnapshot[])[],
  ) {}

  public async goto(): Promise<void> {}
  public currentUrl(): string {
    return this.url;
  }
  public async isVisible(): Promise<boolean> {
    return true;
  }
  public async exists(): Promise<boolean> {
    return true;
  }
  public async fill(): Promise<void> {}
  public async click(): Promise<void> {}
  public async press(): Promise<void> {}
  public async textContents(): Promise<readonly string[]> {
    return [];
  }
  public async elementSnapshots(): Promise<readonly BrowserElementSnapshot[]> {
    const value = this.reads[Math.min(this.readIndex, this.reads.length - 1)] ?? [];
    this.readIndex += 1;
    return value;
  }
  public async scrollIntoView(): Promise<void> {
    this.scrolls += 1;
  }
  public async waitForDomChange(): Promise<DomChangeWaitResult> {
    return 'timeout';
  }
}

function message(role: string, text: string): BrowserElementSnapshot {
  return {
    text,
    attributes: { 'data-message-author-role': role },
  };
}

describe('ChatGptConversationReader', () => {
  it('returns an ordered semantic transcript after the message snapshot stabilizes', async () => {
    const snapshots = [
      message('user', 'Question'),
      message('assistant', 'Answer'),
      message('tool', 'Tool output'),
    ];
    const page = new FakePage('https://chatgpt.com/c/c1', [snapshots, snapshots, snapshots]);

    const transcript = await new ChatGptConversationReader(page).read('c1');

    expect(transcript).toEqual({
      conversationId: 'c1',
      messages: [
        { role: 'user', text: 'Question' },
        { role: 'assistant', text: 'Answer' },
        { role: 'other', text: 'Tool output' },
      ],
    });
    expect(page.scrolls).toBeGreaterThan(0);
  });

  it('rejects a page that resolved to a different conversation id', async () => {
    const page = new FakePage('https://chatgpt.com/c/other', [[message('user', 'Question')]]);

    let caught: unknown;
    try {
      await new ChatGptConversationReader(page).read('c1');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WebAutomationError);
    expect((caught as WebAutomationError).code).toBe('CONVERSATION_NOT_FOUND');
  });
});
