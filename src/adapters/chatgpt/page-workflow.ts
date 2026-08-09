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
  createFallbackWakeupSource,
  type CompletionDetectorDependencies,
  type CompletionDetectorOptions,
  type CompletionWakeupSource,
} from './completion-detector.js';
import {
  ChatGptCompletionSnapshotSource,
  ChatGptComposerProbe,
  ChatGptGenerationProbe,
} from './completion-snapshot.js';
import { ChatGptPromptSubmitter } from './prompt-submit.js';
import { ChatGptPlainTextResponseExtractor } from './response-extractor.js';

export interface ChatGptPageWorkflowOptions {
  readonly authentication?: AuthenticationWaitOptions;
  readonly completion?: CompletionDetectorOptions;
  readonly completionDependencies?: CompletionDetectorDependencies;
}

const DEFAULT_DOM_CHANGE_DEBOUNCE_MS = 75;

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

    const dependencies = this.options.completionDependencies ?? defaultCompletionDependencies();
    const snapshots = new ChatGptCompletionSnapshotSource(
      responses,
      baseline,
      new ChatGptGenerationProbe(this.page),
      new ChatGptComposerProbe(this.page),
    );
    const completion = new ChatGptCompletionDetector(
      snapshots,
      this.createWakeupSource(dependencies),
      this.options.completion,
      dependencies,
    );
    const completed = await completion.waitForCompletion();

    return new ChatGptPlainTextResponseExtractor().extract(completed.responses, baseline);
  }

  private createWakeupSource(
    dependencies: CompletionDetectorDependencies,
  ): CompletionWakeupSource {
    const waitForDomChange = this.page.waitForDomChange;
    if (waitForDomChange === undefined) {
      return createFallbackWakeupSource(dependencies);
    }

    return {
      waitForChange: (timeoutMs) =>
        waitForDomChange.call(this.page, {
          timeoutMs,
          debounceMs: DEFAULT_DOM_CHANGE_DEBOUNCE_MS,
        }),
    };
  }
}

function defaultCompletionDependencies(): CompletionDetectorDependencies {
  return {
    now: Date.now,
    sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  };
}
