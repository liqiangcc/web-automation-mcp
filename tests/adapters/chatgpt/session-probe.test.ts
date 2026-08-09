import { describe, expect, it } from 'vitest';

import { ChatGptSessionProbe } from '../../../src/adapters/chatgpt/session-probe.js';
import type { BrowserPagePort, LocatorCandidate } from '../../../src/ports/browser-port.js';

describe('ChatGptSessionProbe', () => {
  it('prefers explicit login state even when the anonymous prompt is visible', async () => {
    const page = new FakePage((locator) => {
      return isLoginLocator(locator) || isPromptLocator(locator);
    });

    await expect(new ChatGptSessionProbe(page).check()).resolves.toBe('AUTH_REQUIRED');
  });

  it('recognizes the anonymous login modal even when no login button is visible', async () => {
    const page = new FakePage((locator) => {
      return (
        (locator.kind === 'css' && locator.value === '#modal-no-auth-login') ||
        isPromptLocator(locator)
      );
    });

    await expect(new ChatGptSessionProbe(page).check()).resolves.toBe('AUTH_REQUIRED');
  });

  it('reports authenticated when login controls are absent and the prompt is visible', async () => {
    const page = new FakePage((locator) => isPromptLocator(locator));

    await expect(new ChatGptSessionProbe(page).check()).resolves.toBe('AUTHENTICATED');
  });

  it('does not treat a generic login-form textbox as an authenticated prompt', async () => {
    const page = new FakePage((locator) => {
      return locator.kind === 'role' && locator.role === 'textbox' && locator.name === undefined;
    });

    await expect(new ChatGptSessionProbe(page).check()).resolves.toBe('UNKNOWN');
  });

  it('reports unknown when no known authentication markers are visible', async () => {
    const page = new FakePage(() => false);

    await expect(new ChatGptSessionProbe(page).check()).resolves.toBe('UNKNOWN');
  });

  it('reports unknown when browser inspection fails', async () => {
    const page = new FakePage(() => {
      throw new Error('page closed');
    });

    await expect(new ChatGptSessionProbe(page).check()).resolves.toBe('UNKNOWN');
  });
});

class FakePage implements BrowserPagePort {
  public constructor(private readonly visible: (locator: LocatorCandidate) => boolean) {}

  public async goto(): Promise<void> {}

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    return this.visible(locator);
  }

  public async fill(): Promise<void> {}

  public async click(): Promise<void> {}

  public async press(): Promise<void> {}

  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}

function isLoginLocator(locator: LocatorCandidate): boolean {
  return (
    (locator.kind === 'role' && locator.name === 'Log in') ||
    (locator.kind === 'testId' && locator.value === 'login-button')
  );
}

function isPromptLocator(locator: LocatorCandidate): boolean {
  return (
    (locator.kind === 'css' && locator.value === '#prompt-textarea') ||
    (locator.kind === 'placeholder' && locator.text === 'Ask anything')
  );
}
