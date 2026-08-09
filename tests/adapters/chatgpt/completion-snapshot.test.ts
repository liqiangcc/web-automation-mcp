import { describe, expect, it } from 'vitest';

import { ChatGptGenerationProbe } from '../../../src/adapters/chatgpt/completion-snapshot.js';
import { ChatGptTargetResolver } from '../../../src/adapters/chatgpt/target-resolver.js';
import type {
  BrowserPagePort,
  LocatorCandidate,
} from '../../../src/ports/browser-port.js';

const STOP: LocatorCandidate = { kind: 'testId', value: 'stop-button' };

describe('ChatGptGenerationProbe', () => {
  it('returns true when a generation-stop target is visible', async () => {
    const page = new FakePage(() => true);
    const resolver = new ChatGptTargetResolver(page, { 'generation-stop': [STOP] });

    await expect(new ChatGptGenerationProbe(page, resolver).isGenerating()).resolves.toBe(true);
  });

  it('returns false when generation-stop targets are reliably absent', async () => {
    const page = new FakePage(() => false);
    const resolver = new ChatGptTargetResolver(page, { 'generation-stop': [STOP] });

    await expect(new ChatGptGenerationProbe(page, resolver).isGenerating()).resolves.toBe(false);
  });

  it('returns unknown instead of false when generation state cannot be inspected reliably', async () => {
    const page = new FakePage(() => {
      throw new Error('locator inspection failed');
    });
    const resolver = new ChatGptTargetResolver(page, { 'generation-stop': [STOP] });

    await expect(new ChatGptGenerationProbe(page, resolver).isGenerating()).resolves.toBe('unknown');
  });
});

class FakePage implements BrowserPagePort {
  public constructor(
    private readonly visible: (candidate: LocatorCandidate) => boolean,
  ) {}

  public async goto(): Promise<void> {}

  public async isVisible(candidate: LocatorCandidate): Promise<boolean> {
    return this.visible(candidate);
  }

  public async fill(): Promise<void> {}

  public async click(): Promise<void> {}

  public async press(): Promise<void> {}

  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}
