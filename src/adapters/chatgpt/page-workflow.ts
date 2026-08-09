import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort } from '../../ports/browser-port.js';
import {
  AssistantResponseBaselineTracker,
  ChatGptAssistantResponseReader,
} from './assistant-responses.js';
import {
  ChatGptCompletionDetector,
  ChatGptGenerationProbe,
  type CompletionDetectorDependencies,
  type CompletionDetectorOptions,
} from './completion-detector.js';
import { ChatGptPromptSubmitter } from './prompt-submit.js';
import { ChatGptPlainTextResponseExtractor } from './response-extractor.js';
import { ChatGptSessionProbe } from './session-probe.js';

export interface ChatGptPageWorkflowOptions {
  readonly completion?: CompletionDetectorOptions;
  readonly completionDependencies?: CompletionDetectorDependencies;
}

export class ChatGptPageWorkflow {
  public constructor(
    private readonly page: BrowserPagePort,
    private readonly options: ChatGptPageWorkflowOptions = {},
  ) {}

  public async ask(prompt: string): Promise<string> {
    const sessionStatus = await new ChatGptSessionProbe(this.page).check();
    if (sessionStatus === 'AUTH_REQUIRED') {
      throw new WebAutomationError('AUTH_REQUIRED', 'ChatGPT browser profile is not authenticated');
    }
    if (sessionStatus === 'UNKNOWN') {
      throw new WebAutomationError(
        'PROVIDER_UNAVAILABLE',
        'ChatGPT page is not in a recognized authenticated state',
      );
    }

    const responses = new ChatGptAssistantResponseReader(this.page);
    const baseline = await new AssistantResponseBaselineTracker(responses).capture();
    await new ChatGptPromptSubmitter(this.page).submit(prompt);

    const completion = new ChatGptCompletionDetector(
      responses,
      new ChatGptGenerationProbe(this.page),
      this.options.completion,
      this.options.completionDependencies,
    );
    const completed = await completion.waitForCompletion(baseline);

    return new ChatGptPlainTextResponseExtractor().extract(completed.responses, baseline);
  }
}
