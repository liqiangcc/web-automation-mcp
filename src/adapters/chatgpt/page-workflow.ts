import type { BrowserPagePort } from '../../ports/browser-port.js';
import {
  AssistantResponseBaselineTracker,
  ChatGptAssistantResponseReader,
} from './assistant-responses.js';
import { ChatGptAttachmentUploader } from './attachment-uploader.js';
import {
  requireAuthenticatedChatGptSession,
  type AuthenticationWaitOptions,
} from './authentication.js';
import {
  ChatGptCompletionDetector,
  ChatGptGenerationProbe,
  type CompletionDetectorDependencies,
  type CompletionDetectorOptions,
} from './completion-detector.js';
import { ChatGptPromptSubmitter } from './prompt-submit.js';
import { ChatGptPlainTextResponseExtractor } from './response-extractor.js';

export interface ChatGptPageWorkflowOptions {
  readonly authentication?: AuthenticationWaitOptions;
  readonly completion?: CompletionDetectorOptions;
  readonly completionDependencies?: CompletionDetectorDependencies;
}

export class ChatGptPageWorkflow {
  public constructor(
    private readonly page: BrowserPagePort,
    private readonly options: ChatGptPageWorkflowOptions = {},
  ) {}

  public ask(prompt: string): Promise<string> {
    return this.execute(prompt);
  }

  public askWithFiles(prompt: string, filePaths: readonly string[]): Promise<string> {
    return this.execute(prompt, async () => {
      await new ChatGptAttachmentUploader(this.page).upload(filePaths);
    });
  }

  private async execute(prompt: string, prepare?: () => Promise<void>): Promise<string> {
    await requireAuthenticatedChatGptSession(this.page, this.options.authentication);
    await prepare?.();

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
