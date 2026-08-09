import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort } from '../../ports/browser-port.js';
import {
  newestAssistantResponseAfter,
  type AssistantResponseBaseline,
  type AssistantResponseSource,
} from './assistant-responses.js';
import { ChatGptTargetResolver } from './target-resolver.js';

export interface GenerationStatusSource {
  isGenerating(): Promise<boolean>;
}

export class ChatGptGenerationProbe implements GenerationStatusSource {
  private readonly resolver: ChatGptTargetResolver;

  public constructor(page: BrowserPagePort, resolver?: ChatGptTargetResolver) {
    this.resolver = resolver ?? new ChatGptTargetResolver(page);
  }

  public async isGenerating(): Promise<boolean> {
    return (await this.resolver.find('generation-stop')) !== undefined;
  }
}

export interface CompletionDetectorOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly stableWindowMs?: number;
  readonly noSignalStableWindowMs?: number;
}

export interface CompletionDetectorDependencies {
  readonly now: () => number;
  readonly sleep: (delayMs: number) => Promise<void>;
}

export interface CompletionResult {
  readonly responses: readonly string[];
  readonly text: string;
  readonly sawGeneratingSignal: boolean;
  readonly elapsedMs: number;
}

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_STABLE_WINDOW_MS = 1_000;
const DEFAULT_NO_SIGNAL_STABLE_WINDOW_MS = 2_500;

export class ChatGptCompletionDetector {
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly stableWindowMs: number;
  private readonly noSignalStableWindowMs: number;
  private readonly now: () => number;
  private readonly sleep: (delayMs: number) => Promise<void>;

  public constructor(
    private readonly responses: AssistantResponseSource,
    private readonly generation: GenerationStatusSource,
    options: CompletionDetectorOptions = {},
    dependencies: CompletionDetectorDependencies = {
      now: Date.now,
      sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    },
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.stableWindowMs = options.stableWindowMs ?? DEFAULT_STABLE_WINDOW_MS;
    this.noSignalStableWindowMs =
      options.noSignalStableWindowMs ?? DEFAULT_NO_SIGNAL_STABLE_WINDOW_MS;
    this.now = dependencies.now;
    this.sleep = dependencies.sleep;

    assertPositive('timeoutMs', this.timeoutMs);
    assertPositive('pollIntervalMs', this.pollIntervalMs);
    assertNonNegative('stableWindowMs', this.stableWindowMs);
    assertNonNegative('noSignalStableWindowMs', this.noSignalStableWindowMs);
  }

  public async waitForCompletion(
    baseline: AssistantResponseBaseline,
  ): Promise<CompletionResult> {
    const startedAt = this.now();
    let latestText: string | undefined;
    let latestResponses: readonly string[] = [];
    let lastTextChangedAt = startedAt;
    let sawGeneratingSignal = false;
    let wasGenerating = false;
    let generationEndedAt: number | undefined;

    while (this.now() - startedAt <= this.timeoutMs) {
      const responses = await this.responses.read();
      const generating = await this.generation.isGenerating();
      const sampledAt = this.now();
      latestResponses = responses;

      if (generating) {
        sawGeneratingSignal = true;
      }
      if (wasGenerating && !generating) {
        generationEndedAt = sampledAt;
      }
      wasGenerating = generating;

      const currentText = newestAssistantResponseAfter(responses, baseline);
      if (currentText !== undefined) {
        if (currentText !== latestText) {
          latestText = currentText;
          lastTextChangedAt = sampledAt;
        } else if (!generating) {
          const requiredStableWindow = sawGeneratingSignal
            ? this.stableWindowMs
            : this.noSignalStableWindowMs;
          const stabilityAnchor = sawGeneratingSignal
            ? Math.max(lastTextChangedAt, generationEndedAt ?? lastTextChangedAt)
            : lastTextChangedAt;

          if (sampledAt - stabilityAnchor >= requiredStableWindow) {
            return {
              responses: latestResponses,
              text: currentText,
              sawGeneratingSignal,
              elapsedMs: sampledAt - startedAt,
            };
          }
        }
      }

      if (this.now() - startedAt >= this.timeoutMs) {
        break;
      }
      await this.sleep(this.pollIntervalMs);
    }

    throw new WebAutomationError(
      'GENERATION_TIMEOUT',
      `ChatGPT response did not complete within ${this.timeoutMs} ms`,
    );
  }
}

function assertPositive(field: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${field} must be a positive finite number`);
  }
}

function assertNonNegative(field: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${field} must be a non-negative finite number`);
  }
}
