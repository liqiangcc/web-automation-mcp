import { describe, expect, it } from 'vitest';

import { ChatGptPageWorkflow } from '../../../src/adapters/chatgpt/page-workflow.js';
import type { BrowserPagePort, LocatorCandidate } from '../../../src/ports/browser-port.js';

describe('ChatGptPageWorkflow attachments', () => {
  it('attaches files before submitting the prompt and returns the new response', async () => {
    const page = new AttachmentWorkflowPage();
    let clock = 0;
    const workflow = new ChatGptPageWorkflow(page, {
      authentication: {
        timeoutMs: 20,
        pollIntervalMs: 1,
        now: () => clock,
        sleep: async (delayMs) => {
          clock += delayMs;
        },
      },
      completion: {
        timeoutMs: 100,
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

    await expect(workflow.askWithFiles('analyze', ['/safe/a.pdf'])).resolves.toBe(
      'attachment analysis complete',
    );
    expect(page.uploadedFiles).toEqual(['/safe/a.pdf']);
    expect(page.filledPrompt).toBe('analyze');
    expect(page.uploadedBeforeSubmit).toBe(true);
  });
});

class AttachmentWorkflowPage implements BrowserPagePort {
  public uploadedFiles: readonly string[] = [];
  public filledPrompt: string | undefined;
  public uploadedBeforeSubmit = false;
  private submitted = false;

  public async goto(): Promise<void> {}

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    if (locator.kind === 'role' && locator.name === 'Log in') {
      return false;
    }
    if (locator.kind === 'css' && locator.value === '#modal-no-auth-login') {
      return false;
    }
    if (locator.kind === 'testId' && locator.value === 'login-button') {
      return false;
    }
    if (isPromptInput(locator)) {
      return true;
    }
    if (locator.kind === 'testId' && locator.value === 'send-button') {
      return true;
    }
    if (locator.kind === 'css' && locator.value.includes('assistant')) {
      return true;
    }
    return false;
  }

  public async exists(locator: LocatorCandidate): Promise<boolean> {
    return locator.kind === 'css' && locator.value === 'input[type="file"]';
  }

  public async fill(locator: LocatorCandidate, value: string): Promise<void> {
    if (isPromptInput(locator)) {
      this.filledPrompt = value;
    }
  }

  public async click(locator: LocatorCandidate): Promise<void> {
    if (locator.kind === 'testId' && locator.value === 'send-button') {
      this.uploadedBeforeSubmit = this.uploadedFiles.length > 0;
      this.submitted = true;
    }
  }

  public async press(): Promise<void> {
    this.uploadedBeforeSubmit = this.uploadedFiles.length > 0;
    this.submitted = true;
  }

  public async setInputFiles(
    _locator: LocatorCandidate,
    filePaths: readonly string[],
  ): Promise<void> {
    this.uploadedFiles = [...filePaths];
  }

  public async textContents(locator: LocatorCandidate): Promise<readonly string[]> {
    if (locator.kind === 'css' && locator.value.includes('assistant')) {
      return this.submitted ? ['attachment analysis complete'] : [];
    }
    return [];
  }
}

function isPromptInput(locator: LocatorCandidate): boolean {
  return (
    (locator.kind === 'role' && locator.role === 'textbox') ||
    (locator.kind === 'css' && locator.value === '#prompt-textarea')
  );
}
