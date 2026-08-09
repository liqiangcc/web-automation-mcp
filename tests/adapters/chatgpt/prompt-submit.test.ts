import { describe, expect, it } from 'vitest';

import { ChatGptPromptSubmitter } from '../../../src/adapters/chatgpt/prompt-submit.js';
import { ChatGptTargetResolver } from '../../../src/adapters/chatgpt/target-resolver.js';
import type {
  BrowserPagePort,
  LocatorCandidate,
} from '../../../src/ports/browser-port.js';

const INPUT: LocatorCandidate = { kind: 'role', role: 'textbox' };
const SEND: LocatorCandidate = { kind: 'testId', value: 'send-button' };

describe('ChatGptPromptSubmitter', () => {
  it('fills the prompt and clicks the semantic submit target when available', async () => {
    const page = new FakePage((candidate) => {
      return sameCandidate(candidate, INPUT) || sameCandidate(candidate, SEND);
    });
    const submitter = new ChatGptPromptSubmitter(page, createResolver(page));

    await expect(submitter.submit('Explain SRP')).resolves.toEqual({
      method: 'click',
      inputTarget: INPUT,
      submitTarget: SEND,
    });
    expect(page.fills).toEqual([{ target: INPUT, value: 'Explain SRP' }]);
    expect(page.clicks).toEqual([SEND]);
    expect(page.presses).toEqual([]);
  });

  it('falls back to Enter when no submit button candidate is visible', async () => {
    const page = new FakePage((candidate) => sameCandidate(candidate, INPUT));
    const submitter = new ChatGptPromptSubmitter(page, createResolver(page));

    await expect(submitter.submit('hello')).resolves.toEqual({
      method: 'enter',
      inputTarget: INPUT,
    });
    expect(page.fills).toEqual([{ target: INPUT, value: 'hello' }]);
    expect(page.clicks).toEqual([]);
    expect(page.presses).toEqual([{ target: INPUT, key: 'Enter' }]);
  });

  it('rejects a blank prompt before touching the page', async () => {
    const page = new FakePage(() => true);
    const submitter = new ChatGptPromptSubmitter(page, createResolver(page));

    await expect(submitter.submit('   ')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(page.fills).toEqual([]);
    expect(page.clicks).toEqual([]);
    expect(page.presses).toEqual([]);
  });
});

class FakePage implements BrowserPagePort {
  public readonly fills: { readonly target: LocatorCandidate; readonly value: string }[] = [];
  public readonly clicks: LocatorCandidate[] = [];
  public readonly presses: { readonly target: LocatorCandidate; readonly key: string }[] = [];

  public constructor(
    private readonly visible: (candidate: LocatorCandidate) => boolean,
  ) {}

  public async goto(): Promise<void> {}

  public async isVisible(candidate: LocatorCandidate): Promise<boolean> {
    return this.visible(candidate);
  }

  public async fill(target: LocatorCandidate, value: string): Promise<void> {
    this.fills.push({ target, value });
  }

  public async click(target: LocatorCandidate): Promise<void> {
    this.clicks.push(target);
  }

  public async press(target: LocatorCandidate, key: string): Promise<void> {
    this.presses.push({ target, key });
  }

  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}

function createResolver(page: BrowserPagePort): ChatGptTargetResolver {
  return new ChatGptTargetResolver(page, {
    login: [],
    'prompt-input': [INPUT],
    'prompt-submit': [SEND],
  });
}

function sameCandidate(left: LocatorCandidate, right: LocatorCandidate): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
