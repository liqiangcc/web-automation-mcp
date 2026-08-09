import { randomUUID } from 'node:crypto';

import type {
  AskRequest,
  AskResult,
  AskToFileRequest,
  AskToFileResult,
  AskWithFilesRequest,
  AskWithFilesResult,
} from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';
import type { ResponseCompletionMetadata } from '../domain/execution.js';
import type {
  AutomationOperation,
  DiagnosticsBundle,
  LifecycleEvent,
  ObservabilityErrorCode,
  SafeRequestContext,
} from '../domain/observability.js';
import type { AttachmentApplicationPort } from '../ports/attachment-application-port.js';
import type {
  AutomationApplicationPort,
  LastResponseRequest,
  LastResponseResult,
  NewChatRequest,
  NewChatResult,
  SessionStatusRequest,
  SessionStatusResult,
} from '../ports/automation-application-port.js';
import type {
  ConversationCatalogApplicationPort,
  ListConversationsRequest,
  ListConversationsResult,
} from '../ports/conversation-catalog-port.js';
import type {
  ConversationExportApplicationPort,
  ExportConversationRequest,
  ExportConversationResult,
} from '../ports/conversation-export-port.js';
import type {
  ConversationMutationApplicationPort,
  DeleteConversationRequest,
  DeleteConversationResult,
} from '../ports/conversation-mutation-port.js';
import type {
  ConversationReaderApplicationPort,
  GetConversationRequest,
  GetConversationResult,
} from '../ports/conversation-reader-port.js';
import type { DiagnosticsBundleSink, LifecycleSink } from '../ports/observability-port.js';

export interface ObservedAutomationApplicationDependencies {
  readonly lifecycle: LifecycleSink;
  readonly diagnostics: DiagnosticsBundleSink;
  readonly createRequestId?: () => string;
  readonly now?: () => Date;
}

export class ObservedAutomationApplication
  implements
    AutomationApplicationPort,
    AttachmentApplicationPort,
    ConversationCatalogApplicationPort,
    ConversationReaderApplicationPort,
    ConversationExportApplicationPort,
    ConversationMutationApplicationPort
{
  private readonly createRequestId: () => string;
  private readonly now: () => Date;

  public constructor(
    private readonly inner: AutomationApplicationPort &
      Partial<AttachmentApplicationPort> &
      Partial<ConversationCatalogApplicationPort> &
      Partial<ConversationReaderApplicationPort> &
      Partial<ConversationExportApplicationPort> &
      Partial<ConversationMutationApplicationPort>,
    private readonly dependencies: ObservedAutomationApplicationDependencies,
  ) {
    this.createRequestId = dependencies.createRequestId ?? randomUUID;
    this.now = dependencies.now ?? (() => new Date());
  }

  public ask(request: AskRequest): Promise<AskResult> {
    return this.observe('ask', contextFor(request), () => this.inner.ask(request), (result) =>
      result.completion,
    );
  }

  public askWithFiles(request: AskWithFilesRequest): Promise<AskWithFilesResult> {
    return this.observe(
      'ask_with_files',
      contextFor(request),
      async () => {
        const askWithFiles = this.inner.askWithFiles;
        if (askWithFiles === undefined) {
          throw new Error('Attachment application capability is not configured.');
        }
        return askWithFiles.call(this.inner, request);
      },
      (result) => result.completion,
    );
  }

  public askToFile(request: AskToFileRequest): Promise<AskToFileResult> {
    return this.observe(
      'ask_to_file',
      contextFor(request),
      () => this.inner.askToFile(request),
      (result) => result.completion,
    );
  }

  public sessionStatus(request: SessionStatusRequest): Promise<SessionStatusResult> {
    return this.observe('session_status', contextFor(request), () =>
      this.inner.sessionStatus(request),
    );
  }

  public newChat(request: NewChatRequest): Promise<NewChatResult> {
    return this.observe('new_chat', contextFor(request), () => this.inner.newChat(request));
  }

  public getLastResponse(request: LastResponseRequest): Promise<LastResponseResult> {
    return this.observe('get_last_response', contextFor(request), () =>
      this.inner.getLastResponse(request),
    );
  }

  public listConversations(request: ListConversationsRequest): Promise<ListConversationsResult> {
    return this.observe('list_conversations', contextFor(request), async () => {
      const listConversations = this.inner.listConversations;
      if (listConversations === undefined) {
        throw new Error('Conversation catalog capability is not configured.');
      }
      return listConversations.call(this.inner, request);
    });
  }

  public getConversation(request: GetConversationRequest): Promise<GetConversationResult> {
    return this.observe('get_conversation', contextFor(request), async () => {
      const getConversation = this.inner.getConversation;
      if (getConversation === undefined) {
        throw new Error('Conversation reader capability is not configured.');
      }
      return getConversation.call(this.inner, request);
    });
  }

  public exportConversationToFile(
    request: ExportConversationRequest,
  ): Promise<ExportConversationResult> {
    return this.observe('export_conversation', contextFor(request), async () => {
      const exportConversationToFile = this.inner.exportConversationToFile;
      if (exportConversationToFile === undefined) {
        throw new Error('Conversation export capability is not configured.');
      }
      return exportConversationToFile.call(this.inner, request);
    });
  }

  public deleteConversation(request: DeleteConversationRequest): Promise<DeleteConversationResult> {
    return this.observe('delete_conversation', contextFor(request), async () => {
      const deleteConversation = this.inner.deleteConversation;
      if (deleteConversation === undefined) {
        throw new Error('Conversation mutation capability is not configured.');
      }
      return deleteConversation.call(this.inner, request);
    });
  }

  private async observe<T>(
    operation: AutomationOperation,
    context: SafeRequestContext,
    execute: () => Promise<T>,
    completionForResult?: (result: T) => ResponseCompletionMetadata | undefined,
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
      const completion = completionForResult?.(result);
      await this.safeRecord({
        requestId,
        operation,
        phase: 'SUCCESS',
        timestamp: finishedAt.toISOString(),
        durationMs: elapsedMs(startedAt, finishedAt),
        ...completionFields(completion),
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

function completionFields(completion: ResponseCompletionMetadata | undefined): {
  readonly completionPath?: ResponseCompletionMetadata['path'];
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

function elapsedMs(startedAt: Date, finishedAt: Date): number {
  return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function toObservabilityErrorCode(error: unknown): ObservabilityErrorCode {
  return error instanceof WebAutomationError ? error.code : 'INTERNAL_ERROR';
}
