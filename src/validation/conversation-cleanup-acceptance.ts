import { WebAutomationError, type ExecutionErrorCode } from '../domain/errors.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';
import type { ConversationCatalogApplicationPort } from '../ports/conversation-catalog-port.js';
import type { ConversationMutationApplicationPort } from '../ports/conversation-mutation-port.js';
import type { ConversationReaderApplicationPort } from '../ports/conversation-reader-port.js';

export type ConversationCleanupAcceptanceStatus = 'PASS' | 'FAIL' | 'ERROR';

export interface ConversationCleanupAcceptanceReport {
  readonly version: 1;
  readonly profileId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly createdConversationIds: readonly string[];
  readonly preflight: {
    readonly targetPresent: boolean;
    readonly survivorPresent: boolean;
  };
  readonly targetDelete: {
    readonly attempted: boolean;
    readonly deleted: boolean;
    readonly targetAbsentAfterDelete: boolean;
    readonly survivorPresentAfterDelete: boolean;
    readonly repeatDeleteReturnedNotFound: boolean;
  };
  readonly survivor: {
    readonly markerPresentAfterTargetDelete: boolean;
    readonly cleanupAttempted: boolean;
    readonly cleanupDeleted: boolean;
    readonly absentAfterCleanup: boolean;
  };
  readonly status: ConversationCleanupAcceptanceStatus;
  readonly passed: boolean;
  readonly errorCode?: ExecutionErrorCode | 'INTERNAL_ERROR';
  readonly reason?:
    | 'seed_response_incomplete'
    | 'preflight_identity_missing'
    | 'target_still_present'
    | 'survivor_missing_after_target_delete'
    | 'survivor_content_changed'
    | 'repeat_delete_not_not_found'
    | 'survivor_cleanup_not_confirmed';
}

export interface ConversationCleanupAcceptanceOptions {
  readonly profileId: string;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly now?: () => number;
}

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_MAX_PAGES = 3;

export async function runConversationCleanupAcceptance(
  application: AutomationApplicationPort &
    ConversationCatalogApplicationPort &
    ConversationReaderApplicationPort &
    ConversationMutationApplicationPort,
  options: ConversationCleanupAcceptanceOptions,
): Promise<ConversationCleanupAcceptanceReport> {
  const now = options.now ?? Date.now;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const startedAtMs = now();
  const startedAt = new Date(startedAtMs).toISOString();
  const runId = String(startedAtMs);
  const targetMarker = `WEB_AUTOMATION_CLEANUP_TARGET::${runId}`;
  const survivorMarker = `WEB_AUTOMATION_CLEANUP_SURVIVOR::${runId}`;

  let targetId: string | undefined;
  let survivorId: string | undefined;
  let targetPresent = false;
  let survivorPresent = false;
  let targetDeleteAttempted = false;
  let targetDeleted = false;
  let targetAbsentAfterDelete = false;
  let survivorPresentAfterDelete = false;
  let repeatDeleteReturnedNotFound = false;
  let markerPresentAfterTargetDelete = false;
  let survivorCleanupAttempted = false;
  let survivorCleanupDeleted = false;
  let survivorAbsentAfterCleanup = false;

  const finish = (
    status: ConversationCleanupAcceptanceStatus,
    reason?: ConversationCleanupAcceptanceReport['reason'],
  ): ConversationCleanupAcceptanceReport => ({
    version: 1,
    profileId: options.profileId,
    startedAt,
    completedAt: new Date(now()).toISOString(),
    createdConversationIds: [targetId, survivorId].filter((value): value is string => value !== undefined),
    preflight: { targetPresent, survivorPresent },
    targetDelete: {
      attempted: targetDeleteAttempted,
      deleted: targetDeleted,
      targetAbsentAfterDelete,
      survivorPresentAfterDelete,
      repeatDeleteReturnedNotFound,
    },
    survivor: {
      markerPresentAfterTargetDelete,
      cleanupAttempted: survivorCleanupAttempted,
      cleanupDeleted: survivorCleanupDeleted,
      absentAfterCleanup: survivorAbsentAfterCleanup,
    },
    status,
    passed: status === 'PASS',
    ...(reason === undefined ? {} : { reason }),
  });

  try {
    const session = await application.sessionStatus({
      provider: 'chatgpt',
      profileId: options.profileId,
    });
    if (session.status !== 'AUTHENTICATED') {
      throw new WebAutomationError(
        session.status === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'PROVIDER_UNAVAILABLE',
        'Cleanup acceptance requires an authenticated ChatGPT profile.',
      );
    }

    const target = await application.ask({
      provider: 'chatgpt',
      profileId: options.profileId,
      prompt: `Reply with exactly this marker and nothing else: ${targetMarker}`,
    });
    targetId = target.conversationId;
    if (!target.responseText.includes(targetMarker)) {
      return finish('FAIL', 'seed_response_incomplete');
    }

    const survivor = await application.ask({
      provider: 'chatgpt',
      profileId: options.profileId,
      prompt: `Reply with exactly this marker and nothing else: ${survivorMarker}`,
    });
    survivorId = survivor.conversationId;
    if (!survivor.responseText.includes(survivorMarker) || survivorId === targetId) {
      return finish('FAIL', 'seed_response_incomplete');
    }

    const before = await collectRecentIds(application, options.profileId, pageSize, maxPages);
    targetPresent = before.has(targetId);
    survivorPresent = before.has(survivorId);
    if (!targetPresent || !survivorPresent) {
      return finish('FAIL', 'preflight_identity_missing');
    }

    targetDeleteAttempted = true;
    const deletedTarget = await application.deleteConversation({
      provider: 'chatgpt',
      profileId: options.profileId,
      conversationId: targetId,
    });
    targetDeleted = deletedTarget.deleted;

    const afterTarget = await collectRecentIds(application, options.profileId, pageSize, maxPages);
    targetAbsentAfterDelete = !afterTarget.has(targetId);
    survivorPresentAfterDelete = afterTarget.has(survivorId);
    if (!targetAbsentAfterDelete) {
      return finish('FAIL', 'target_still_present');
    }
    if (!survivorPresentAfterDelete) {
      return finish('FAIL', 'survivor_missing_after_target_delete');
    }

    const survivorTranscript = await application.getConversation({
      provider: 'chatgpt',
      profileId: options.profileId,
      conversationId: survivorId,
    });
    markerPresentAfterTargetDelete = survivorTranscript.messages.some(
      (message) => message.role === 'assistant' && message.text.includes(survivorMarker),
    );
    if (!markerPresentAfterTargetDelete) {
      return finish('FAIL', 'survivor_content_changed');
    }

    try {
      await application.deleteConversation({
        provider: 'chatgpt',
        profileId: options.profileId,
        conversationId: targetId,
      });
    } catch (error) {
      repeatDeleteReturnedNotFound =
        error instanceof WebAutomationError && error.code === 'CONVERSATION_NOT_FOUND';
    }
    if (!repeatDeleteReturnedNotFound) {
      return finish('FAIL', 'repeat_delete_not_not_found');
    }

    survivorCleanupAttempted = true;
    const survivorDeleted = await application.deleteConversation({
      provider: 'chatgpt',
      profileId: options.profileId,
      conversationId: survivorId,
    });
    survivorCleanupDeleted = survivorDeleted.deleted;
    const afterCleanup = await collectRecentIds(application, options.profileId, pageSize, maxPages);
    survivorAbsentAfterCleanup = !afterCleanup.has(survivorId);
    if (!survivorCleanupDeleted || !survivorAbsentAfterCleanup) {
      return finish('FAIL', 'survivor_cleanup_not_confirmed');
    }

    return finish('PASS');
  } catch (error) {
    return {
      ...finish('ERROR'),
      errorCode: error instanceof WebAutomationError ? error.code : 'INTERNAL_ERROR',
    };
  }
}

async function collectRecentIds(
  application: ConversationCatalogApplicationPort,
  profileId: string,
  pageSize: number,
  maxPages: number,
): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await application.listConversations({
      provider: 'chatgpt',
      profileId,
      limit: pageSize,
      ...(cursor === undefined ? {} : { cursor }),
    });
    for (const conversation of result.conversations) {
      ids.add(conversation.conversationId);
    }
    if (result.nextCursor === undefined) {
      break;
    }
    cursor = result.nextCursor;
  }

  return ids;
}
