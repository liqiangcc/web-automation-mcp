import { randomUUID } from 'node:crypto';

import { WebAutomationError } from '../domain/errors.js';
import type {
  AutomationOperation,
  DiagnosticsBundle,
  LifecycleEvent,
  ObservabilityErrorCode,
  SafeRequestContext,
} from '../domain/observability.js';
import type {
  AutomationApplicationPort,
  LastResponseRequest,
  LastResponseResult,
  NewChatRequest,
  NewChatResult,
  SessionStatusRequest,
  SessionStatusResult,
} from '../ports/automation-application-port.js';
import type { AskRequest, AskResult } from '../domain/conversation.js';
import type { DiagnosticsBundleSink, LifecycleSink } from '../ports/observability-port.js';

export interface ObservedAutomationApplicationDependencies {
  readonly lifecycle: LifecycleSink;
  readonly diagnostics: DiagnosticsBundleSink;
  readonly createRequestId?: () => string;
  readonly now?: () => Date;
}

export class ObservedAutomationApplication implements AutomationApplicationPort {
  private readonly createRequestId: () => string;
  private readonly now: () => Date;

  public constructor(
    private readonly inner: AutomationApplicationPort,
    private readonly dependencies: ObservedAutomationApplicationDependencies,
  ) {
    this.createRequestId = dependencies.createRequestId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  public ask(request: AskRequest): Promise<AskResult> {
    return this.observe('ask', contextFor(request), () => this.inner.ask(request));
  }

  public sessionStatus(request: SessionStatusRequest): Promise<SessionStatusResult> {
    return this.observe('session_status', contextFor(request), () => this.inner.sessionStatus(request));
  }

  public newChat(request: NewChatRequest): Promise<NewChatResult> {
    return this.observe('new_chat', contextFor(request), () => this.inner.newChat(request));
  }

  public getLastResponse(request: LastResponseRequest): Promise<LastResponseResult> {
    return this.observe('get_last_response', contextFor(request), () =>
      this.inner.getLastResponse(request),
    );
  }

  private async observe<T>(
    operation: AutomationOperation,
    context: SafeRequestContext,
    execute: () => Promise<T>,
  ): Promise<T> {
    const requestId = this.createRequestId();
    const startedAt = this.now();

    await this.safeRecord({
      requestId,
      operation,
      phase: 'START',
      timestamp: startedAt.toISOString(),
      ...context,
    });

    try {
      const result = await execute();
      const finishedAt = this.now();
      await this.safeRecord({
        requestId,
        operation,
        phase: 'SUCCESS',
        timestamp: finishedAt.toISOString(),
        durationMs: elapsedMs(startedAt, finishedAt),
        ...context,
      });
      return result;
    } catch (error) {
      const finishedAt = this.now();
      const errorCode = toObservabilityErrorCode(error);
      const durationMs = elapsedMs(startedAt, finishedAt);

      await this.safeRecord({
        requestId,
        operation,
        phase: 'FAILURE',
        timestamp: finishedAt.toISOString(),
        durationMs,
        errorCode,
        ...context,
      });

      const bundle: DiagnosticsBundle = {
        version: 1,
        requestId,
        operation,
        timestamp: finishedAt.toISOString(),
        durationMs,
        errorCode,
        ...context,
      };
      await this.safeWriteDiagnostics(bundle);
      throw error;
    }
  }

  private async safeRecord(event: LifecycleEvent): Promise<void> {
    try {
      await this.dependencies.lifecycle.record(event);
    } catch {
      // Observability must never change the result of the business operation.
    }
  }

  private async safeWriteDiagnostics(bundle: DiagnosticsBundle): Promise<void> {
    try {
      await this.dependencies.diagnostics.write(bundle);
    } catch {
      // Diagnostics failure must not mask the original application failure.
    }
  }
}

function contextFor(request: {
  readonly provider: SafeRequestContext['provider'];
  readonly profileId: SafeRequestContext['profileId'];
  readonly conversationId?: string;
}): SafeRequestContext {
  return {
    provider: request.provider,
    profileId: request.profileId,
    hasConversationId: request.conversationId !== undefined,
  };
}

function elapsedMs(startedAt: Date, finishedAt: Date): number {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function toObservabilityErrorCode(error: unknown): ObservabilityErrorCode {
  return error instanceof WebAutomationError ? error.code : 'INTERNAL_ERROR';
}
