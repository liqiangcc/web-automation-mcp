import { describe, expect, it } from 'vitest';

import { ChatGptConversationCatalog } from '../../../src/adapters/chatgpt/conversation-catalog.js';
import type {
  BrowserElementSnapshot,
  BrowserPagePort,
  DomChangeWaitOptions,
  DomChangeWaitResult,
  LocatorCandidate,
} from '../../../src/ports/browser-port.js';

class FakePage implements BrowserPagePort {
  private readIndex = 0;
  public scrolls = 0;

  public constructor(private readonly reads: readonly (readonly BrowserElementSnapshot[])[]) {}

  public async goto(): Promise<void> {}
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

  public async elementSnapshots(
    _locator: LocatorCandidate,
    _attributeNames: readonly string[],
  ): Promise<readonly BrowserElementSnapshot[]> {
    const value = this.reads[Math.min(this.readIndex, this.reads.length - 1)] ?? [];
    this.readIndex += 1;
    return value;
  }

  public async scrollIntoView(): Promise<void> {
    this.scrolls += 1;
  }

  public async waitForDomChange(
    _options: DomChangeWaitOptions,
  ): Promise<DomChangeWaitResult> {
    return 'changed';
  }
}

function item(id: string, title: string): BrowserElementSnapshot {
  return {
    text: title,
    attributes: { href: `/c/${id}` },
  };
}

describe('ChatGptConversationCatalog', () => {
  it('deduplicates virtualized rows and returns an opaque resumable cursor', async () => {
    const firstPage = new FakePage([
      [item('c1', 'First'), item('c2', 'Second')],
      [item('c1', 'First'), item('c2', 'Second'), item('c3', 'Third')],
    ]);

    const first = await new ChatGptConversationCatalog(firstPage).list({
      profileId: 'default',
      limit: 2,
    });

    expect(first.conversations).toEqual([
      { conversationId: 'c1', title: 'First' },
      { conversationId: 'c2', title: 'Second' },
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));
    if (first.nextCursor === undefined) {
      throw new Error('expected first page cursor');
    }

    const secondPage = new FakePage([
      [item('c1', 'First'), item('c2', 'Second')],
      [item('c1', 'First'), item('c2', 'Second'), item('c3', 'Third')],
      [item('c1', 'First'), item('c2', 'Second'), item('c3', 'Third')],
    ]);
    const second = await new ChatGptConversationCatalog(secondPage).list({
      profileId: 'default',
      limit: 2,
      cursor: first.nextCursor,
    });

    expect(second.conversations).toEqual([{ conversationId: 'c3', title: 'Third' }]);
    expect(second.nextCursor).toBeUndefined();
  });

  it('does not treat repeated DOM wakeups without new ids as semantic progress', async () => {
    const page = new FakePage([[item('c1', 'First')]]);

    const result = await new ChatGptConversationCatalog(page).list({
      profileId: 'default',
      limit: 20,
    });

    expect(result.conversations).toEqual([{ conversationId: 'c1', title: 'First' }]);
    expect(result.nextCursor).toBeUndefined();
    expect(page.scrolls).toBeGreaterThan(0);
    expect(page.scrolls).toBeLessThanOrEqual(3);
  });
});
