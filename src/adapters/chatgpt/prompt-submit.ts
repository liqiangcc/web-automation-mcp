import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort, LocatorCandidate } from '../../ports/browser-port.js';
import { ChatGptTargetResolver } from './target-resolver.js';

export interface PromptSubmitResult {
  readonly method: 'click' | 'enter';
  readonly inputTarget: LocatorCandidate;
  readonly submitTarget?: LocatorCandidate;
}

export class ChatGptPromptSubmitter {
  private readonly resolver: ChatGptTargetResolver;

  public constructor(
    private readonly page: BrowserPagePort,
    resolver?: ChatGptTargetResolver,
  ) {
    this.resolver = resolver ?? new ChatGptTargetResolver(page);
  }

  public async submit(prompt: string): Promise<PromptSubmitResult> {
    if (prompt.trim().length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'prompt must contain non-whitespace text');
    }

    const inputTarget = await this.resolver.require('prompt-input');
    await this.page.fill(inputTarget, prompt);

    const submitTarget = await this.resolver.find('prompt-submit');
    if (submitTarget !== undefined) {
      await this.page.click(submitTarget);
      return {
        method: 'click',
        inputTarget,
        submitTarget,
      };
    }

    await this.page.press(inputTarget, 'Enter');
    return {
      method: 'enter',
      inputTarget,
    };
  }
}
