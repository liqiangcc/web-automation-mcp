import { describe, expect, it } from 'vitest';

import { ChatGptPageWorkflow } from '../../../src/adapters/chatgpt/page-workflow.js';
import type { BrowserPagePort, LocatorCandidate } from '../../../src/ports/browser-port.js';

describe('ChatGptPageWorkflow', () => {
  it('captures a baseline, submits a prompt, waits for a new stable response, and returns it', async () => {
    const page = new FakeChatPage();
    let clock = 0;

    const workflow = new ChatGptPageWorkflow(page, {
      completion: {
        timeoutMs: 1_000,
        pollIntervalMs: 10,
        stableWindowMs: 0,
        noSignalStableWindowMs: 0,
      },
      completionDependencies: {
        now: () => clock,
        sleep: async (delayMs) => {
          clock += delayMs;
        },
      },
    });

    await expect(workflow.ask('What is SRP?')).resolves.toBe('SRP has one reason to change.');
    expect(page.filledPrompt).toBe('What is SRP?');
  });

  it('rejects an unauthenticated profile before submitting a prompt', async () => {
    const page = new FakeChatPage();
    page.authenticated = false;

    const workflow = new ChatGptPageWorkflow(page, {
      authentication: { timeoutMs: 0 },
    });

    await expect(workflow.ask('hello')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(page.filledPrompt).toBeUndefined();
  });
});

class FakeChatPage implements BrowserPagePort {
  public authenticated = true;
  public filledPrompt: string | undefined;
  private submitted = false;

  public async goto(): Promise<void> {}

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    if (locator.kind === 'role' && locator.name === 'Log in') {
      return !this.authenticated;
    }
    if (isPromptInput(locator)) {
      return this.authenticated;
    }
    if (locator.kind === 'testId' && locator.value === 'send-button') {
      return this.authenticated;
    }
    if (locator.kind === 'css' && locator.value.includes('assistant')) {
      return true;
    }
    return false;
  }

  public async fill(locator: LocatorCandidate, value: string): Promise<void> {
    if (isPromptInput(locator)) {
      this.filledPrompt = value;
    }
  }

  public async click(locator: LocatorCandidate): Promise<void> {
    if (locator.kind === 'testId' && locator.value === 'send-button') {
      this.submitted = true;
    }
  }

  public async press(): Promise<void> {
    this.submitted = true;
  }

  public async textContents(locator: LocatorCandidate): Promise<readonly string[]> {
    if (locator.kind === 'css' && locator.value.includes('assistant')) {
      return this.submitted
        ? ['Existing answer', 'SRP has one reason to change.']
        : ['Existing answer'];
    }
    return [];
  }
}

function isPromptInput(locator: LocatorCandidate): boolean {
  return locator.kind === 'role' && locator.role === 'textbox';
}
