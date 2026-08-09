import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort } from '../../ports/browser-port.js';
import { ChatGptTargetResolver } from './target-resolver.js';

export interface AssistantResponseBaseline {
  readonly count: number;
}

export interface AssistantResponseSource {
  read(): Promise<readonly string[]>;
}

export class ChatGptAssistantResponseReader implements AssistantResponseSource {
  private readonly resolver: ChatGptTargetResolver;

  public constructor(
    private readonly page: BrowserPagePort,
    resolver?: ChatGptTargetResolver,
  ) {
    this.resolver = resolver ?? new ChatGptTargetResolver(page);
  }

  public async read(): Promise<readonly string[]> {
    const target = await this.resolver.find('assistant-response');
    if (target === undefined) {
      return [];
    }

    try {
      const contents = await this.page.textContents(target);
      return contents.map(normalizeResponseText);
    } catch (error) {
      throw new WebAutomationError(
        'EXTRACTION_FAILED',
        'Failed to read ChatGPT assistant responses',
        { cause: error },
      );
    }
  }
}

export class AssistantResponseBaselineTracker {
  public constructor(private readonly source: AssistantResponseSource) {}

  public async capture(): Promise<AssistantResponseBaseline> {
    const responses = await this.source.read();
    return { count: responses.length };
  }
}

export function newestAssistantResponseAfter(
  responses: readonly string[],
  baseline: AssistantResponseBaseline,
): string | undefined {
  if (responses.length <= baseline.count) {
    return undefined;
  }

  for (let index = responses.length - 1; index >= baseline.count; index -= 1) {
    const response = responses[index];
    if (response !== undefined && response.trim().length > 0) {
      return response.trim();
    }
  }

  return undefined;
}

function normalizeResponseText(value: string): string {
  return value.replaceAll('\u00a0', ' ').trim();
}
