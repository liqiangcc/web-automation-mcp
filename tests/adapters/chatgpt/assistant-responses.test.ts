import { describe, expect, it } from 'vitest';

import {
  AssistantResponseBaselineTracker,
  ChatGptAssistantResponseReader,
  newestAssistantResponseAfter,
} from '../../../src/adapters/chatgpt/assistant-responses.js';
import { ChatGptTargetResolver } from '../../../src/adapters/chatgpt/target-resolver.js';
import type {
  BrowserPagePort,
  LocatorCandidate,
} from '../../../src/ports/browser-port.js';

const ASSISTANT: LocatorCandidate = {
  kind: 'css',
  value: '[data-message-author-role="assistant"] .markdown',
};

describe('assistant response tracking', () => {
  it('captures the number of assistant responses before a request', async () => {
    const page = new FakePage([' first ', 'second']);
    const reader = new ChatGptAssistantResponseReader(page, createResolver(page));
    const tracker = new AssistantResponseBaselineTracker(reader);

    await expect(tracker.capture()).resolves.toEqual({ count: 2 });
    await expect(reader.read()).resolves.toEqual(['first', 'second']);
  });

  it('treats no assistant response target as an empty baseline', async () => {
    const page = new FakePage([], false);
    const reader = new ChatGptAssistantResponseReader(page, createResolver(page));

    await expect(new AssistantResponseBaselineTracker(reader).capture()).resolves.toEqual({
      count: 0,
    });
  });

  it('returns only a non-empty response created after the baseline', () => {
    expect(newestAssistantResponseAfter(['old', '', 'new answer'], { count: 1 })).toBe(
      'new answer',
    );
    expect(newestAssistantResponseAfter(['old'], { count: 1 })).toBeUndefined();
  });
});

class FakePage implements BrowserPagePort {
  public constructor(
    private readonly responses: readonly string[],
    private readonly assistantVisible = true,
  ) {}

  public async goto(): Promise<void> {}

  public async isVisible(candidate: LocatorCandidate): Promise<boolean> {
    return this.assistantVisible && JSON.stringify(candidate) === JSON.stringify(ASSISTANT);
  }

  public async fill(): Promise<void> {}

  public async click(): Promise<void> {}

  public async press(): Promise<void> {}

  public async textContents(): Promise<readonly string[]> {
    return this.responses;
  }
}

function createResolver(page: BrowserPagePort): ChatGptTargetResolver {
  return new ChatGptTargetResolver(page, { 'assistant-response': [ASSISTANT] });
}
