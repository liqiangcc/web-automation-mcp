import { WebAutomationError, type ExecutionErrorCode } from '../domain/errors.js';
import type { ResponseCompletionMetadata, ResponseCompletionPath } from '../domain/execution.js';
import type { AttachmentApplicationPort } from '../ports/attachment-application-port.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';

export type LiveValidationApplication = AutomationApplicationPort & AttachmentApplicationPort;

export type ValidationCategory =
  | 'short'
  | 'long'
  | 'code'
  | 'multi_turn'
  | 'slow'
  | 'repeated_new_chat';

export interface ValidationCase {
  readonly id: string;
  readonly category: ValidationCategory;
  readonly prompt: string;
  readonly conversationKey?: string;
}

export type ValidationCaseStatus = 'SUCCESS' | 'INCOMPLETE_RESPONSE' | 'ERROR';

export interface ValidationCaseResult {
  readonly id: string;
  readonly category: ValidationCategory;
  readonly status: ValidationCaseStatus;
  readonly durationMs: number;
  readonly responseChars?: number;
  readonly conversationContinued: boolean;
  readonly exceeded30Seconds: boolean;
  readonly errorCode?: ExecutionErrorCode | 'INTERNAL_ERROR';
  readonly completionPath?: ResponseCompletionPath;
  readonly completionWaitMs?: number;
  readonly completionLatencyMs?: number;
}

export interface CompletionValidationSummary {
  readonly fast: number;
  readonly fallback: number;
  readonly unavailable: number;
  readonly latencySamples: number;
  readonly averageLatencyMs?: number;
  readonly p95LatencyMs?: number;
  readonly maxLatencyMs?: number;
}

export interface ValidationSummary {
  readonly requested: number;
  readonly attempted: number;
  readonly succeeded: number;
  readonly incomplete: number;
  readonly failed: number;
  readonly successRate: number;
  readonly targetSuccessRate: number;
  readonly passed: boolean;
  readonly over30Seconds: number;
  readonly failureCodes: Readonly<Record<string, number>>;
  readonly completion: CompletionValidationSummary;
}

export interface LiveValidationReport {
  readonly version: 1;
  readonly profileId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly results: readonly ValidationCaseResult[];
  readonly summary: ValidationSummary;
}

export interface AttachmentValidationSpec {
  readonly id: string;
  readonly files: readonly string[];
  readonly prompt: string;
  readonly expectedText?: readonly string[];
}

export interface AttachmentValidationResult {
  readonly id: string;
  readonly status: ValidationCaseStatus;
  readonly durationMs: number;
  readonly fileCount: number;
  readonly responseChars?: number;
  readonly errorCode?: ExecutionErrorCode | 'INTERNAL_ERROR';
  readonly completionPath?: ResponseCompletionPath;
  readonly completionWaitMs?: number;
  readonly completionLatencyMs?: number;
}

export interface LiveValidationOptions {
  readonly profileId: string;
  readonly delayMs?: number;
  readonly targetSuccessRate?: number;
  readonly now?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void>;
}

const DEFAULT_TARGET_SUCCESS_RATE = 0.95;
const DEFAULT_DELAY_MS = 1_000;

export function buildValidationMatrix(): readonly ValidationCase[] {
  return [
    ...numberedCases('short', 5, (index) =>
      `Answer in one short sentence: what is ${index} + ${index}?`,
    ),
    ...numberedCases('long', 5, (index) =>
      `Write a structured explanation of separation of concerns for a software engineer. Use at least ${450 + index * 25} words, with headings and a concrete example.`,
    ),
    ...numberedCases('code', 5, (index) =>
      `Write a TypeScript function named validationExample${index} that accepts an array of numbers and returns the sum. Include a short explanation and one example call.`,
    ),
    ...Array.from({ length: 5 }, (_, offset): ValidationCase => {
      const index = offset + 1;
      return {
        id: `multi_turn_${index}`,
        category: 'multi_turn',
        conversationKey: 'multi_turn_series',
        prompt:
          index === 1
            ? 'Remember the token MANGO-417 for this conversation and reply with a short acknowledgement.'
            : `This is follow-up ${index - 1}. State the token I asked you to remember, then add one sentence about why conversation continuity matters.`,
      };
    }),
    ...numberedCases('slow', 5, (index) =>
      `Produce a detailed technical essay of at least ${1_100 + index * 50} words about reliable browser automation. Cover session state, semantic locators, completion detection, diagnostics, security, and failure classification.`,
    ),
    ...numberedCases('repeated_new_chat', 5, (index) =>
      `This is isolated new-chat validation run ${index}. Reply with exactly two sentences explaining why deterministic automation is useful.`,
    ),
  ];
}

export async function runLiveValidation(
  application: LiveValidationApplication,
  options: LiveValidationOptions,
): Promise<LiveValidationReport> {
  const matrix = buildValidationMatrix();
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  const targetSuccessRate = options.targetSuccessRate ?? DEFAULT_TARGET_SUCCESS_RATE;
  assertNonNegative('delayMs', delayMs);
  assertRate(targetSuccessRate);

  const session = await application.sessionStatus({ provider: 'chatgpt', profileId: options.profileId });
  if (session.status !== 'AUTHENTICATED') {
    throw new WebAutomationError(
      session.status === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'PROVIDER_UNAVAILABLE',
      `Live validation requires an authenticated ChatGPT session; current status is ${session.status}.`,
    );
  }

  const startedAt = new Date(now()).toISOString();
  const conversationIds = new Map<string, string>();
  const results: ValidationCaseResult[] = [];

  for (let index = 0; index < matrix.length; index += 1) {
    const validationCase = matrix[index];
    if (validationCase === undefined) {
      continue;
    }

    const marker = validationMarker(validationCase.id);
    const existingConversationId = validationCase.conversationKey
      ? conversationIds.get(validationCase.conversationKey)
      : undefined;
    const caseStartedAt = now();

    try {
      const result = await application.ask({
        provider: 'chatgpt',
        profileId: options.profileId,
        prompt: withValidationMarker(validationCase.prompt, marker),
        ...(existingConversationId === undefined ? {} : { conversationId: existingConversationId }),
      });
      const durationMs = Math.max(0, now() - caseStartedAt);
      if (validationCase.conversationKey !== undefined) {
        conversationIds.set(validationCase.conversationKey, result.conversationId);
      }
      const complete = result.responseText.includes(marker);
      results.push({
        id: validationCase.id,
        category: validationCase.category,
        status: complete ? 'SUCCESS' : 'INCOMPLETE_RESPONSE',
        durationMs,
        responseChars: result.responseText.length,
        conversationContinued: existingConversationId !== undefined,
        exceeded30Seconds: durationMs > 30_000,
        ...completionFields(result.completion),
      });
    } catch (error) {
      const durationMs = Math.max(0, now() - caseStartedAt);
      results.push({
        id: validationCase.id,
        category: validationCase.category,
        status: 'ERROR',
        durationMs,
        conversationContinued: existingConversationId !== undefined,
        exceeded30Seconds: durationMs > 30_000,
        errorCode: classifyError(error),
      });
      if (error instanceof WebAutomationError && error.code === 'AUTH_REQUIRED') {
        break;
      }
    }

    if (delayMs > 0 && index < matrix.length - 1) {
      await sleep(delayMs);
    }
  }

  const completedAt = new Date(now()).toISOString();
  return {
    version: 1,
    profileId: options.profileId,
    startedAt,
    completedAt,
    results,
    summary: summarizeValidation(matrix.length, results, targetSuccessRate),
  };
}

export async function runAttachmentValidation(
  application: LiveValidationApplication,
  profileId: string,
  specs: readonly AttachmentValidationSpec[],
  now: () => number = Date.now,
): Promise<readonly AttachmentValidationResult[]> {
  const results: AttachmentValidationResult[] = [];

  for (const spec of specs) {
    const marker = validationMarker(`attachment_${spec.id}`);
    const startedAt = now();
    try {
      const result = await application.askWithFiles({
        provider: 'chatgpt',
        profileId,
        prompt: withValidationMarker(spec.prompt, marker),
        files: spec.files,
      });
      const expectedText = spec.expectedText ?? [];
      const complete =
        result.fileCount === spec.files.length &&
        result.responseText.includes(marker) &&
        expectedText.every((value) => result.responseText.includes(value));
      results.push({
        id: spec.id,
        status: complete ? 'SUCCESS' : 'INCOMPLETE_RESPONSE',
        durationMs: Math.max(0, now() - startedAt),
        fileCount: result.fileCount,
        responseChars: result.responseText.length,
        ...completionFields(result.completion),
      });
    } catch (error) {
      results.push({
        id: spec.id,
        status: 'ERROR',
        durationMs: Math.max(0, now() - startedAt),
        fileCount: spec.files.length,
        errorCode: classifyError(error),
      });
    }
  }

  return results;
}

export function validationMarker(id: string): string {
  return `WEB_AUTOMATION_VALIDATION_END::${id}`;
}

function withValidationMarker(prompt: string, marker: string): string {
  return `${prompt}\n\nAt the very end of your response, on its own line, output exactly this marker: ${marker}`;
}

function numberedCases(
  category: Exclude<ValidationCategory, 'multi_turn'>,
  count: number,
  prompt: (index: number) => string,
): readonly ValidationCase[] {
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return {
      id: `${category}_${index}`,
      category,
      prompt: prompt(index),
    };
  });
}

function summarizeValidation(
  requested: number,
  results: readonly ValidationCaseResult[],
  targetSuccessRate: number,
): ValidationSummary {
  const succeeded = results.filter((result) => result.status === 'SUCCESS').length;
  const incomplete = results.filter((result) => result.status === 'INCOMPLETE_RESPONSE').length;
  const failed = results.filter((result) => result.status === 'ERROR').length;
  const failureCodes: Record<string, number> = {};
  for (const result of results) {
    if (result.errorCode !== undefined) {
      failureCodes[result.errorCode] = (failureCodes[result.errorCode] ?? 0) + 1;
    }
  }
  const successRate = requested === 0 ? 0 : succeeded / requested;
  return {
    requested,
    attempted: results.length,
    succeeded,
    incomplete,
    failed,
    successRate,
    targetSuccessRate,
    passed: results.length === requested && successRate >= targetSuccessRate,
    over30Seconds: results.filter((result) => result.exceeded30Seconds).length,
    failureCodes,
    completion: summarizeCompletion(results),
  };
}

function summarizeCompletion(
  results: readonly ValidationCaseResult[],
): CompletionValidationSummary {
  const latencies = results
    .map((result) => result.completionLatencyMs)
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);
  const averageLatencyMs =
    latencies.length === 0
      ? undefined
      : Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length);
  const p95LatencyMs = percentile(latencies, 0.95);
  const maxLatencyMs = latencies.at(-1);

  return {
    fast: results.filter((result) => result.completionPath === 'fast').length,
    fallback: results.filter((result) => result.completionPath === 'fallback').length,
    unavailable: results.filter((result) => result.completionPath === undefined).length,
    latencySamples: latencies.length,
    ...(averageLatencyMs === undefined ? {} : { averageLatencyMs }),
    ...(p95LatencyMs === undefined ? {} : { p95LatencyMs }),
    ...(maxLatencyMs === undefined ? {} : { maxLatencyMs }),
  };
}

function percentile(values: readonly number[], percentileValue: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const index = Math.max(0, Math.ceil(values.length * percentileValue) - 1);
  return values[index];
}

function completionFields(completion: ResponseCompletionMetadata | undefined): {
  readonly completionPath?: ResponseCompletionPath;
  readonly completionWaitMs?: number;
  readonly completionLatencyMs?: number;
} {
  if (completion === undefined) {
    return {};
  }
  return {
    completionPath: completion.path,
    completionWaitMs: completion.waitMs,
    completionLatencyMs: completion.latencyMs,
  };
}

function classifyError(error: unknown): ExecutionErrorCode | 'INTERNAL_ERROR' {
  return error instanceof WebAutomationError ? error.code : 'INTERNAL_ERROR';
}

function assertNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} must be a non-negative finite number.`);
  }
}

function assertRate(value: number): void {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new WebAutomationError('INVALID_REQUEST', 'targetSuccessRate must be in the range (0, 1].');
  }
}
