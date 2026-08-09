import { WebAutomationError, type ExecutionErrorCode } from '../domain/errors.js';
import type { ResponseCompletionPath } from '../domain/execution.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';

export type CompletionAcceptanceStatus = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'ERROR';

export interface FastCompletionSample {
  readonly id: string;
  readonly status: CompletionAcceptanceStatus;
  readonly durationMs: number;
  readonly completionPath?: ResponseCompletionPath;
  readonly completionWaitMs?: number;
  readonly completionLatencyMs?: number;
  readonly errorCode?: ExecutionErrorCode | 'INTERNAL_ERROR';
}

export interface FastCompletionSummary {
  readonly requested: number;
  readonly passedSamples: number;
  readonly fastSamples: number;
  readonly fallbackSamples: number;
  readonly unavailableMetadata: number;
  readonly latencySamples: number;
  readonly averageLatencyMs?: number;
  readonly p95LatencyMs?: number;
  readonly maxLatencyMs?: number;
  readonly maxAllowedLatencyMs: number;
  readonly requiredFastSamples: number;
  readonly passed: boolean;
  readonly conclusive: boolean;
}

export interface LongCompletionResult {
  readonly status: CompletionAcceptanceStatus;
  readonly durationMs: number;
  readonly minimumCompletionWaitMs: number;
  readonly completionPath?: ResponseCompletionPath;
  readonly completionWaitMs?: number;
  readonly completionLatencyMs?: number;
  readonly errorCode?: ExecutionErrorCode | 'INTERNAL_ERROR';
  readonly reason?: 'response_finished_before_minimum_duration' | 'completion_metadata_unavailable';
}

export interface CompletionAcceptanceReport {
  readonly version: 1;
  readonly profileId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly fast: {
    readonly samples: readonly FastCompletionSample[];
    readonly summary: FastCompletionSummary;
  };
  readonly long?: LongCompletionResult;
  readonly passed: boolean;
  readonly conclusive: boolean;
}

export interface CompletionAcceptanceOptions {
  readonly profileId: string;
  readonly fastRuns?: number;
  readonly maxFastLatencyMs?: number;
  readonly longMinimumCompletionWaitMs?: number;
  readonly skipLong?: boolean;
  readonly now?: () => number;
}

const DEFAULT_FAST_RUNS = 5;
const DEFAULT_MAX_FAST_LATENCY_MS = 1_000;
const DEFAULT_LONG_MINIMUM_COMPLETION_WAIT_MS = 120_000;

export async function runCompletionAcceptance(
  application: AutomationApplicationPort,
  options: CompletionAcceptanceOptions,
): Promise<CompletionAcceptanceReport> {
  const now = options.now ?? Date.now;
  const fastRuns = options.fastRuns ?? DEFAULT_FAST_RUNS;
  const maxFastLatencyMs = options.maxFastLatencyMs ?? DEFAULT_MAX_FAST_LATENCY_MS;
  const longMinimumCompletionWaitMs =
    options.longMinimumCompletionWaitMs ?? DEFAULT_LONG_MINIMUM_COMPLETION_WAIT_MS;

  assertPositiveInteger('fastRuns', fastRuns);
  assertPositive('maxFastLatencyMs', maxFastLatencyMs);
  assertPositive('longMinimumCompletionWaitMs', longMinimumCompletionWaitMs);

  const session = await application.sessionStatus({ provider: 'chatgpt', profileId: options.profileId });
  if (session.status !== 'AUTHENTICATED') {
    throw new WebAutomationError(
      session.status === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'PROVIDER_UNAVAILABLE',
      `Completion acceptance requires an authenticated ChatGPT session; current status is ${session.status}.`,
    );
  }

  const startedAt = new Date(now()).toISOString();
  const fastSamples: FastCompletionSample[] = [];

  for (let index = 1; index <= fastRuns; index += 1) {
    const marker = `WEB_AUTOMATION_COMPLETION_FAST::${index}`;
    const requestStartedAt = now();
    try {
      const result = await application.ask({
        provider: 'chatgpt',
        profileId: options.profileId,
        prompt: `${fastPrompt(index)}\n\nAt the very end, on its own line, output exactly: ${marker}`,
      });
      const durationMs = Math.max(0, now() - requestStartedAt);
      const completion = result.completion;
      const markerPresent = result.responseText.includes(marker);
      const status: CompletionAcceptanceStatus = !markerPresent
        ? 'FAIL'
        : completion === undefined
          ? 'INCONCLUSIVE'
          : completion.path === 'fast' && completion.latencyMs <= maxFastLatencyMs
            ? 'PASS'
            : 'FAIL';

      fastSamples.push({
        id: `fast_${index}`,
        status,
        durationMs,
        ...(completion === undefined
          ? {}
          : {
              completionPath: completion.path,
              completionWaitMs: completion.waitMs,
              completionLatencyMs: completion.latencyMs,
            }),
      });
    } catch (error) {
      fastSamples.push({
        id: `fast_${index}`,
        status: 'ERROR',
        durationMs: Math.max(0, now() - requestStartedAt),
        errorCode: classifyError(error),
      });
    }
  }

  const fastSummary = summarizeFast(fastSamples, maxFastLatencyMs);
  const long = options.skipLong
    ? undefined
    : await runLongAcceptance(application, options.profileId, longMinimumCompletionWaitMs, now);
  const passed = fastSummary.passed && (long === undefined || long.status === 'PASS');
  const conclusive = fastSummary.conclusive && (long === undefined || long.status !== 'INCONCLUSIVE');

  return {
    version: 1,
    profileId: options.profileId,
    startedAt,
    completedAt: new Date(now()).toISOString(),
    fast: { samples: fastSamples, summary: fastSummary },
    ...(long === undefined ? {} : { long }),
    passed,
    conclusive,
  };
}

async function runLongAcceptance(
  application: AutomationApplicationPort,
  profileId: string,
  minimumCompletionWaitMs: number,
  now: () => number,
): Promise<LongCompletionResult> {
  const marker = 'WEB_AUTOMATION_COMPLETION_LONG::END';
  const startedAt = now();
  try {
    const result = await application.ask({
      provider: 'chatgpt',
      profileId,
      prompt: `${longPrompt()}\n\nAt the very end, on its own line, output exactly: ${marker}`,
    });
    const durationMs = Math.max(0, now() - startedAt);
    if (!result.responseText.includes(marker)) {
      return {
        status: 'FAIL',
        durationMs,
        minimumCompletionWaitMs,
        ...(result.completion === undefined
          ? {}
          : {
              completionPath: result.completion.path,
              completionWaitMs: result.completion.waitMs,
              completionLatencyMs: result.completion.latencyMs,
            }),
      };
    }

    const completion = result.completion;
    if (completion === undefined) {
      return {
        status: 'INCONCLUSIVE',
        durationMs,
        minimumCompletionWaitMs,
        reason: 'completion_metadata_unavailable',
      };
    }

    if (completion.waitMs < minimumCompletionWaitMs) {
      return {
        status: 'INCONCLUSIVE',
        durationMs,
        minimumCompletionWaitMs,
        completionPath: completion.path,
        completionWaitMs: completion.waitMs,
        completionLatencyMs: completion.latencyMs,
        reason: 'response_finished_before_minimum_duration',
      };
    }

    return {
      status: 'PASS',
      durationMs,
      minimumCompletionWaitMs,
      completionPath: completion.path,
      completionWaitMs: completion.waitMs,
      completionLatencyMs: completion.latencyMs,
    };
  } catch (error) {
    return {
      status: 'ERROR',
      durationMs: Math.max(0, now() - startedAt),
      minimumCompletionWaitMs,
      errorCode: classifyError(error),
    };
  }
}

function summarizeFast(
  samples: readonly FastCompletionSample[],
  maxAllowedLatencyMs: number,
): FastCompletionSummary {
  const metadataSamples = samples.filter((sample) => sample.completionPath !== undefined);
  const fastSamples = metadataSamples.filter((sample) => sample.completionPath === 'fast').length;
  const fallbackSamples = metadataSamples.filter((sample) => sample.completionPath === 'fallback').length;
  const unavailableMetadata = samples.length - metadataSamples.length;
  const latencies = samples
    .map((sample) => sample.completionLatencyMs)
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);
  const requiredFastSamples = Math.max(1, Math.ceil(samples.length * 0.8));
  const passedSamples = samples.filter((sample) => sample.status === 'PASS').length;
  const conclusive = unavailableMetadata === 0;

  if (latencies.length === 0) {
    return {
      requested: samples.length,
      passedSamples,
      fastSamples,
      fallbackSamples,
      unavailableMetadata,
      latencySamples: 0,
      maxAllowedLatencyMs,
      requiredFastSamples,
      passed: false,
      conclusive,
    };
  }

  const p95LatencyMs = percentile(latencies, 0.95);
  const maxLatencyMs = latencies[latencies.length - 1];
  if (p95LatencyMs === undefined || maxLatencyMs === undefined) {
    throw new WebAutomationError('INTERNAL_ERROR' as never, 'Latency summary invariant failed.');
  }
  const passed =
    conclusive &&
    fastSamples >= requiredFastSamples &&
    passedSamples >= requiredFastSamples &&
    p95LatencyMs <= maxAllowedLatencyMs &&
    samples.every((sample) => sample.status !== 'ERROR');

  return {
    requested: samples.length,
    passedSamples,
    fastSamples,
    fallbackSamples,
    unavailableMetadata,
    latencySamples: latencies.length,
    averageLatencyMs: Math.round(
      latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
    ),
    p95LatencyMs,
    maxLatencyMs,
    maxAllowedLatencyMs,
    requiredFastSamples,
    passed,
    conclusive,
  };
}

function percentile(sortedValues: readonly number[], percentileValue: number): number | undefined {
  if (sortedValues.length === 0) {
    return undefined;
  }
  const index = Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1);
  return sortedValues[index];
}

function fastPrompt(index: number): string {
  return `Write 4 concise paragraphs (roughly 180-250 words total) explaining one reliability principle for browser automation. This is sample ${index}. Include a small concrete example, but do not use Markdown tables.`;
}

function longPrompt(): string {
  return 'Write a single, continuous, highly detailed technical tutorial of at least 4,500 words about reliable browser automation architecture. Cover session isolation, semantic locators, DOM event observation, completion state machines, timeout semantics, diagnostics, security boundaries, failure classification, attachments, and test strategy. Do not shorten the requested length. Use headings and concrete examples.';
}

function classifyError(error: unknown): ExecutionErrorCode | 'INTERNAL_ERROR' {
  return error instanceof WebAutomationError ? error.code : 'INTERNAL_ERROR';
}

function assertPositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} must be a positive finite number.`);
  }
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} must be a positive integer.`);
  }
}
