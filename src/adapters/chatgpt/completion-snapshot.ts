import type { BrowserPagePort } from '../../ports/browser-port.js';
import {
  newestAssistantResponseAfter,
  type AssistantResponseBaseline,
  type AssistantResponseSource,
} from './assistant-responses.js';
import { ChatGptTargetResolver } from './target-resolver.js';

export type ObservableBoolean = boolean | 'unknown';

export interface GenerationStatusSource {
  isGenerating(): Promise<ObservableBoolean>;
}

export interface ComposerStatusSource {
  isReady(): Promise<ObservableBoolean>;
}

export interface CompletionSnapshot {
  readonly responses: readonly string[];
  readonly responsePresent: boolean;
  readonly responseText?: string;
  readonly generating: ObservableBoolean;
  readonly composerReady: ObservableBoolean;
}

export interface CompletionSnapshotSource {
  read(): Promise<CompletionSnapshot>;
}

export class ChatGptGenerationProbe implements GenerationStatusSource {
  private readonly resolver: ChatGptTargetResolver;

  public constructor(page: BrowserPagePort, resolver?: ChatGptTargetResolver) {
    this.resolver = resolver ?? new ChatGptTargetResolver(page);
  }

  public async isGenerating(): Promise<ObservableBoolean> {
    const observation = await this.resolver.observe('generation-stop');
    switch (observation.status) {
      case 'FOUND':
        return true;
      case 'ABSENT':
        return false;
      case 'UNKNOWN':
        return 'unknown';
    }
  }
}

export class ChatGptComposerProbe implements ComposerStatusSource {
  private readonly resolver: ChatGptTargetResolver;

  public constructor(
    private readonly page: BrowserPagePort,
    resolver?: ChatGptTargetResolver,
  ) {
    this.resolver = resolver ?? new ChatGptTargetResolver(page);
  }

  public async isReady(): Promise<ObservableBoolean> {
    const input = await this.resolver.find('prompt-input');
    if (input === undefined) {
      return 'unknown';
    }

    const isEditable = this.page.isEditable;
    if (isEditable === undefined) {
      return true;
    }

    try {
      return await isEditable.call(this.page, input);
    } catch {
      return 'unknown';
    }
  }
}

export class ChatGptCompletionSnapshotSource implements CompletionSnapshotSource {
  public constructor(
    private readonly responses: AssistantResponseSource,
    private readonly baseline: AssistantResponseBaseline,
    private readonly generation: GenerationStatusSource,
    private readonly composer: ComposerStatusSource,
  ) {}

  public async read(): Promise<CompletionSnapshot> {
    const [responses, generating, composerReady] = await Promise.all([
      this.responses.read(),
      this.generation.isGenerating(),
      this.composer.isReady(),
    ]);
    const responseText = newestAssistantResponseAfter(responses, this.baseline);

    return {
      responses,
      responsePresent: responseText !== undefined,
      ...(responseText === undefined ? {} : { responseText }),
      generating,
      composerReady,
    };
  }
}
