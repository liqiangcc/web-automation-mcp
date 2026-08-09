import { WebAutomationError } from '../../domain/errors.js';
import type {
  CompletionSnapshot,
  CompletionSnapshotSource,
} from './completion-snapshot.js';

export interface CompletionWakeupSource {
  waitForChange(timeoutMs: number): Promise<'changed' | 'timeout'>;
}

export interface CompletionDetectorOptions {
  readonly startTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly absoluteTimeoutMs?: number;
  readonly fastSettleMs?: number;
  readonly fallbackSettleMs?: number;
  readonly watchdogIntervalMs?: number;
  /** @deprecated Use absoluteTimeoutMs. */
  readonly timeoutMs?: number;
  /** @deprecated Use watchdogIntervalMs. */
  readonly pollIntervalMs?: number;
  /** @deprecated Use fastSettleMs. */
  readonly stableWindowMs?: number;
  /** @deprecated Use fallbackSettleMs. */
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
  readonly completionPath: 'fast' | 'fallback';
  readonly completionLatencyMs: number;
}

const DEFAULT_START_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_ABSOLUTE_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_FAST_SETTLE_MS = 400;
const DEFAULT_FALLBACK_SETTLE_MS = 1_500;
const DEFAULT_WATCHDOG_INTERVAL_MS = 1_000;

export class ChatGptCompletionDetector {
  private readonly startTimeoutMs: number;
  private readonly idleTimeoutMs: number;
  private readonly absoluteTimeoutMs: number;
  private readonly fastSettleMs: number;
  private readonly fallbackSettleMs: number;
  private readonly watchdogIntervalMs: number;
  private readonly now: () => number;

  public constructor(
    private readonly snapshots: CompletionSnapshotSource,
    private readonly wakeups: CompletionWakeupSource,
    options: CompletionDetectorOptions = {},
    dependencies: CompletionDetectorDependencies = {
      now: Date.now,
      sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    },
  ) {
    this.startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
    this.absoluteTimeoutMs =
      options.absoluteTimeoutMs ?? options.timeoutMs ?? DEFAULT_ABSOLUTE_TIMEOUT_MS;
    this.fastSettleMs = options.fastSettleMs ?? options.stableWindowMs ?? DEFAULT_FAST_SETTLE_MS;
    this.fallbackSettleMs =
      options.fallbackSettleMs ??
      options.noSignalStableWindowMs ??
      DEFAULT_FALLBACK_SETTLE_MS;
    this.watchdogIntervalMs =
      options.watchdogIntervalMs ?? options.pollIntervalMs ?? DEFAULT_WATCHDOG_INTERVAL_MS;
    this.now = dependencies.now;

    assertPositive('startTimeoutMs', this.startTimeoutMs);
    assertPositive('idleTimeoutMs', this.idleTimeoutMs);
    assertPositive('absoluteTimeoutMs', this.absoluteTimeoutMs);
    assertNonNegative('fastSettleMs', this.fastSettleMs);
    assertNonNegative('fallbackSettleMs', this.fallbackSettleMs);
    assertPositive('watchdogIntervalMs', this.watchdogIntervalMs);
  }

  public async waitForCompletion(): Promise<CompletionResult> {
    const startedAt = this.now();
    let lastActivityAt = startedAt;
    let previous: CompletionSnapshot | undefined;
    let current = await this.snapshots.read();
    let sawGeneratingSignal = current.generating === true;
    let started = hasStarted(current);
    let candidateSince: number | undefined;
    let candidatePath: 'fast' | 'fallback' | undefined;

    if (started) {
      lastActivityAt = startedAt;
    }

    while (true) {
      const sampledAt = this.now();
      const semanticChanged = previous !== undefined && hasSemanticChange(previous, current);

      if (semanticChanged) {
        lastActivityAt = sampledAt;
      }
      if (!started && hasStarted(current)) {
        started = true;
        lastActivityAt = sampledAt;
      }
      if (current.generating === true) {
        sawGeneratingSignal = true;
      }

      const path = completionCandidatePath(current, sawGeneratingSignal);
      if (path === undefined) {
        candidateSince = undefined;
        candidatePath = undefined;
      } else if (
        candidateSince === undefined ||
        candidatePath !== path ||
        semanticChanged
      ) {
        candidateSince = sampledAt;
        candidatePath = path;
      }

      if (candidateSince !== undefined && candidatePath !== undefined) {
        const settleMs = candidatePath === 'fast' ? this.fastSettleMs : this.fallbackSettleMs;
        if (sampledAt - candidateSince >= settleMs) {
          const text = current.responseText;
          if (text !== undefined) {
            return {
              responses: current.responses,
              text,
              sawGeneratingSignal,
              elapsedMs: sampledAt - startedAt,
              completionPath: candidatePath,
              completionLatencyMs: Math.max(0, sampledAt - candidateSince),
            };
          }
        }
      }

      this.throwIfTimedOut({
        startedAt,
        sampledAt,
        started,
        lastActivityAt,
      });

      const waitMs = this.nextWaitMs({
        startedAt,
        sampledAt,
        started,
        lastActivityAt,
        candidateSince,
        candidatePath,
      });

      await this.wakeups.waitForChange(waitMs);
      previous = current;
      current = await this.snapshots.read();
    }
  }

  private throwIfTimedOut(input: {
    readonly startedAt: number;
    readonly sampledAt: number;
    readonly started: boolean;
    readonly lastActivityAt: number;
  }): void {
    const elapsedMs = input.sampledAt - input.startedAt;
    if (elapsedMs >= this.absoluteTimeoutMs) {
      throw new WebAutomationError(
        'GENERATION_TIMEOUT',
        `ChatGPT response exceeded the absolute completion limit of ${this.absoluteTimeoutMs} ms`,
      );
    }

    if (!input.started && elapsedMs >= this.startTimeoutMs) {
      throw new WebAutomationError(
        'RESPONSE_START_TIMEOUT',
        `ChatGPT response did not start within ${this.startTimeoutMs} ms`,
      );
    }

    if (input.started && input.sampledAt - input.lastActivityAt >= this.idleTimeoutMs) {
      throw new WebAutomationError(
        'GENERATION_STALLED',
        `ChatGPT response made no semantic progress for ${this.idleTimeoutMs} ms`,
      );
    }
  }

  private nextWaitMs(input: {
    readonly startedAt: number;
    readonly sampledAt: number;
    readonly started: boolean;
    readonly lastActivityAt: number;
    readonly candidateSince: number | undefined;
    readonly candidatePath: 'fast' | 'fallback' | undefined;
  }): number {
    const deadlines = [input.startedAt + this.absoluteTimeoutMs];

    if (input.started) {
      deadlines.push(input.lastActivityAt + this.idleTimeoutMs);
    } else {
      deadlines.push(input.startedAt + this.startTimeoutMs);
    }

    if (input.candidateSince !== undefined && input.candidatePath !== undefined) {
      deadlines.push(
        input.candidateSince +
          (input.candidatePath === 'fast' ? this.fastSettleMs : this.fallbackSettleMs),
      );
    }

    const nextDeadline = Math.min(...deadlines);
    const untilDeadline = Math.max(1, nextDeadline - input.sampledAt);
    return Math.min(untilDeadline, this.watchdogIntervalMs);
  }
}

export function createFallbackWakeupSource(
  dependencies: CompletionDetectorDependencies,
): CompletionWakeupSource {
  return {
    waitForChange: async (timeoutMs) => {
      await dependencies.sleep(timeoutMs);
      return 'timeout';
    },
  };
}

function hasStarted(snapshot: CompletionSnapshot): boolean {
  return snapshot.responsePresent || snapshot.generating === true;
}

function completionCandidatePath(
  snapshot: CompletionSnapshot,
  sawGeneratingSignal: boolean,
): 'fast' | 'fallback' | undefined {
  if (
    !snapshot.responsePresent ||
    snapshot.responseText === undefined ||
    snapshot.responseText.length === 0 ||
    snapshot.generating === true ||
    snapshot.composerReady === false
  ) {
    return undefined;
  }

  return sawGeneratingSignal && snapshot.generating === false ? 'fast' : 'fallback';
}

function hasSemanticChange(previous: CompletionSnapshot, current: CompletionSnapshot): boolean {
  return (
    previous.responsePresent !== current.responsePresent ||
    previous.responseText !== current.responseText ||
    previous.generating !== current.generating ||
    previous.composerReady !== current.composerReady
  );
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
