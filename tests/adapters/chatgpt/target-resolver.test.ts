import { describe, expect, it } from 'vitest';

import { ChatGptTargetResolver } from '../../../src/adapters/chatgpt/target-resolver.js';
import type {
  BrowserPagePort,
  LocatorCandidate,
} from '../../../src/ports/browser-port.js';

const PRIMARY: LocatorCandidate = { kind: 'role', role: 'textbox' };
const FALLBACK: LocatorCandidate = { kind: 'css', value: '#prompt-textarea' };

describe('ChatGptTargetResolver', () => {
  it('uses ordered fallback candidates until one is visible', async () => {
    const page = new FakePage((candidate) => sameCandidate(candidate, FALLBACK));
    const resolver = new ChatGptTargetResolver(page, {
      login: [],
      'prompt-input': [PRIMARY, FALLBACK],
      'prompt-submit': [],
    });

    await expect(resolver.require('prompt-input')).resolves.toEqual(FALLBACK);
    expect(page.checked).toEqual([PRIMARY, FALLBACK]);
  });

  it('continues to later candidates when one locator inspection fails', async () => {
    const page = new FakePage((candidate) => {
      if (sameCandidate(candidate, PRIMARY)) {
        throw new Error('unsupported locator');
      }
      return sameCandidate(candidate, FALLBACK);
    });
    const resolver = new ChatGptTargetResolver(page, {
      login: [],
      'prompt-input': [PRIMARY, FALLBACK],
      'prompt-submit': [],
    });

    await expect(resolver.find('prompt-input')).resolves.toEqual(FALLBACK);
  });

  it('returns undefined for an optional unresolved target', async () => {
    const resolver = new ChatGptTargetResolver(new FakePage(() => false));

    await expect(resolver.find('prompt-submit')).resolves.toBeUndefined();
  });

  it('reports ABSENT only when every configured candidate was inspected successfully', async () => {
    const resolver = new ChatGptTargetResolver(new FakePage(() => false), {
      'generation-stop': [PRIMARY, FALLBACK],
    });

    await expect(resolver.observe('generation-stop')).resolves.toEqual({ status: 'ABSENT' });
  });

  it('reports UNKNOWN when target inspection fails and no fallback is found', async () => {
    const resolver = new ChatGptTargetResolver(
      new FakePage(() => {
        throw new Error('page inspection failed');
      }),
      { 'generation-stop': [PRIMARY, FALLBACK] },
    );

    await expect(resolver.observe('generation-stop')).resolves.toEqual({ status: 'UNKNOWN' });
  });

  it('reports UNKNOWN when a semantic target has no configured candidates', async () => {
    const resolver = new ChatGptTargetResolver(new FakePage(() => false), {
      'generation-stop': [],
    });

    await expect(resolver.observe('generation-stop')).resolves.toEqual({ status: 'UNKNOWN' });
  });

  it('throws TARGET_NOT_FOUND when a required target cannot be resolved', async () => {
    const resolver = new ChatGptTargetResolver(new FakePage(() => false));

    await expect(resolver.require('prompt-input')).rejects.toMatchObject({
      code: 'TARGET_NOT_FOUND',
    });
  });
});

class FakePage implements BrowserPagePort {
  public readonly checked: LocatorCandidate[] = [];

  public constructor(
    private readonly visible: (candidate: LocatorCandidate) => boolean,
  ) {}

  public async goto(): Promise<void> {}

  public async isVisible(candidate: LocatorCandidate): Promise<boolean> {
    this.checked.push(candidate);
    return this.visible(candidate);
  }

  public async fill(): Promise<void> {}

  public async click(): Promise<void> {}

  public async press(): Promise<void> {}

  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}

function sameCandidate(left: LocatorCandidate, right: LocatorCandidate): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
