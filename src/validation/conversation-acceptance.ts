import { WebAutomationError, type ExecutionErrorCode } from '../domain/errors.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';
import type { ConversationCatalogApplicationPort } from '../ports/conversation-catalog-port.js';

export type ConversationAcceptanceStatus = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'ERROR';

export interface ConversationAcceptancePageResult {
  readonly page: number;
  readonly returnedCount: number;
  readonly duplicateCount: number;
  readonly hasNextCursor: boolean;
  readonly seedFound: boolean;
}

export interface ConversationAcceptanceReport {
  readonly version: 1;
  readonly profileId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly createdConversationIds: readonly string[];
  readonly discovery: {
    readonly pageSize: number;
    readonly maxPages: number;
    readonly pages: readonly ConversationAcceptancePageResult[];
    readonly seedFound: boolean;
    readonly duplicateCount: number;
    readonly paginationExercised: boolean;
  };
  readonly continuation: {
    readonly attempted: boolean;
    readonly sameConversationId: boolean;
    readonly markerPresent: boolean;
    readonly reopenedLastResponseMarkerPresent: boolean;
  };
  readonly status: ConversationAcceptanceStatus;
  readonly passed: boolean;
  readonly conclusive: boolean;
  readonly errorCode?: ExecutionErrorCode | 'INTERNAL_ERROR';
  readonly reason?:
    | 'seed_response_incomplete'
    | 'seed_not_discovered'
    | 'duplicate_conversation_ids'
    | 'pagination_not_exercised'
    | 'continuation_changed_conversation'
    | 'continuation_response_incomplete'
    | 'reopened_response_mismatch';
}

export interface ConversationAcceptanceOptions {
  readonly profileId: string;
  readonly pageSize?: number;
  readonly maxPages?: number;
  readonly now?: () => number;
}

const DEFAULT_PAGE_SIZE = 5;
const DEFAULT_MAX_PAGES = 5;

export async function runConversationAcceptance(
  application: AutomationApplicationPort & ConversationCatalogApplicationPort,
  options: ConversationAcceptanceOptions,
): Promise<ConversationAcceptanceReport> {
  const now = options.now ?? Date.now;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;

  assertPositiveInteger('pageSize', pageSize);
  assertPositiveInteger('maxPages', maxPages);
  if (pageSize > 50) {
    throw new WebAutomationError('INVALID_REQUEST', 'pageSize must be <= 50.');
  }

  const session = await application.sessionStatus({ provider: 'chatgpt', profileId: options.profileId });
  if (session.status !== 'AUTHENTICATED') {
    throw new WebAutomationError(
      session.status === 'AUTH_REQUIRED' ? 'AUTH_REQUIRED' : 'PROVIDER_UNAVAILABLE',
      `Conversation acceptance requires an authenticated ChatGPT session; current status is ${session.status}.`,
    );
  }

  const startedAtMs = now();
  const startedAt = new Date(startedAtMs).toISOString();
  const runId = String(startedAtMs);
  const seedMarker = `WEB_AUTOMATION_CONVERSATION_SEED::${runId}`;
  const continuationMarker = `WEB_AUTOMATION_CONVERSATION_CONTINUE::${runId}`;
  const pages: ConversationAcceptancePageResult[] = [];
  const seenConversationIds = new Set<string>();
  let duplicateCount = 0;
  let seedConversationId: string | undefined;
  let seedFound = false;
  let paginationExercised = false;
  let continuationAttempted = false;
  let sameConversationId = false;
  let continuationMarkerPresent = false;
  let reopenedLastResponseMarkerPresent = false;

  try {
    const seed = await application.ask({
      provider: 'chatgpt',
      profileId: options.profileId,
      prompt: `Reply with exactly this marker and nothing else: ${seedMarker}`,
    });
    seedConversationId = seed.conversationId;

    if (!seed.responseText.includes(seedMarker)) {
      return report({
        options,
        startedAt,
        now,
        pageSize,
        maxPages,
        pages,
        seedConversationId,
        seedFound,
        duplicateCount,
        paginationExercised,
        continuationAttempted,
        sameConversationId,
        continuationMarkerPresent,
        reopenedLastResponseMarkerPresent,
        status: 'FAIL',
        reason: 'seed_response_incomplete',
      });
    }

    let cursor: string | undefined;
    for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
      const listed = await application.listConversations({
        provider: 'chatgpt',
        profileId: options.profileId,
        limit: pageSize,
        ...(cursor === undefined ? {} : { cursor }),
      });

      let pageDuplicates = 0;
      let pageSeedFound = false;
      for (const conversation of listed.conversations) {
        if (seenConversationIds.has(conversation.conversationId)) {
          duplicateCount += 1;
          pageDuplicates += 1;
        } else {
          seenConversationIds.add(conversation.conversationId);
        }
        if (conversation.conversationId === seedConversationId) {
          seedFound = true;
          pageSeedFound = true;
        }
      }

      pages.push({
        page: pageIndex,
        returnedCount: listed.conversations.length,
        duplicateCount: pageDuplicates,
        hasNextCursor: listed.nextCursor !== undefined,
        seedFound: pageSeedFound,
      });

      if (duplicateCount > 0) {
        return report({
          options,
          startedAt,
          now,
          pageSize,
          maxPages,
          pages,
          seedConversationId,
          seedFound,
          duplicateCount,
          paginationExercised,
          continuationAttempted,
          sameConversationId,
          continuationMarkerPresent,
          reopenedLastResponseMarkerPresent,
          status: 'FAIL',
          reason: 'duplicate_conversation_ids',
        });
      }

      if (pageIndex >= 2) {
        paginationExercised = true;
      }

      if (listed.nextCursor === undefined) {
        break;
      }
      cursor = listed.nextCursor;

      if (seedFound && paginationExercised) {
        break;
      }
    }

    if (!seedFound) {
      return report({
        options,
        startedAt,
        now,
        pageSize,
        maxPages,
        pages,
        seedConversationId,
        seedFound,
        duplicateCount,
        paginationExercised,
        continuationAttempted,
        sameConversationId,
        continuationMarkerPresent,
        reopenedLastResponseMarkerPresent,
        status: 'FAIL',
        reason: 'seed_not_discovered',
      });
    }

    continuationAttempted = true;
    const continued = await application.ask({
      provider: 'chatgpt',
      profileId: options.profileId,
      conversationId: seedConversationId,
      prompt: `Reply with exactly this marker and nothing else: ${continuationMarker}`,
    });
    sameConversationId = continued.conversationId === seedConversationId;
    continuationMarkerPresent = continued.responseText.includes(continuationMarker);

    if (!sameConversationId) {
      return report({
        options,
        startedAt,
        now,
        pageSize,
        maxPages,
        pages,
        seedConversationId,
        seedFound,
        duplicateCount,
        paginationExercised,
        continuationAttempted,
        sameConversationId,
        continuationMarkerPresent,
        reopenedLastResponseMarkerPresent,
        status: 'FAIL',
        reason: 'continuation_changed_conversation',
      });
    }

    if (!continuationMarkerPresent) {
      return report({
        options,
        startedAt,
        now,
        pageSize,
        maxPages,
        pages,
        seedConversationId,
        seedFound,
        duplicateCount,
        paginationExercised,
        continuationAttempted,
        sameConversationId,
        continuationMarkerPresent,
        reopenedLastResponseMarkerPresent,
        status: 'FAIL',
        reason: 'continuation_response_incomplete',
      });
    }

    const reopened = await application.getLastResponse({
      provider: 'chatgpt',
      profileId: options.profileId,
      conversationId: seedConversationId,
    });
    reopenedLastResponseMarkerPresent = reopened.responseText.includes(continuationMarker);

    if (!reopenedLastResponseMarkerPresent) {
      return report({
        options,
        startedAt,
        now,
        pageSize,
        maxPages,
        pages,
        seedConversationId,
        seedFound,
        duplicateCount,
        paginationExercised,
        continuationAttempted,
        sameConversationId,
        continuationMarkerPresent,
        reopenedLastResponseMarkerPresent,
        status: 'FAIL',
        reason: 'reopened_response_mismatch',
      });
    }

    return report({
      options,
      startedAt,
      now,
      pageSize,
      maxPages,
      pages,
      seedConversationId,
      seedFound,
      duplicateCount,
      paginationExercised,
      continuationAttempted,
      sameConversationId,
      continuationMarkerPresent,
      reopenedLastResponseMarkerPresent,
      status: paginationExercised ? 'PASS' : 'INCONCLUSIVE',
      ...(paginationExercised ? {} : { reason: 'pagination_not_exercised' as const }),
    });
  } catch (error) {
    return {
      ...report({
        options,
        startedAt,
        now,
        pageSize,
        maxPages,
        pages,
        ...(seedConversationId === undefined ? {} : { seedConversationId }),
        seedFound,
        duplicateCount,
        paginationExercised,
        continuationAttempted,
        sameConversationId,
        continuationMarkerPresent,
        reopenedLastResponseMarkerPresent,
        status: 'ERROR',
      }),
      errorCode: classifyError(error),
    };
  }
}

interface ReportInput {
  readonly options: ConversationAcceptanceOptions;
  readonly startedAt: string;
  readonly now: () => number;
  readonly pageSize: number;
  readonly maxPages: number;
  readonly pages: readonly ConversationAcceptancePageResult[];
  readonly seedConversationId?: string;
  readonly seedFound: boolean;
  readonly duplicateCount: number;
  readonly paginationExercised: boolean;
  readonly continuationAttempted: boolean;
  readonly sameConversationId: boolean;
  readonly continuationMarkerPresent: boolean;
  readonly reopenedLastResponseMarkerPresent: boolean;
  readonly status: ConversationAcceptanceStatus;
  readonly reason?: ConversationAcceptanceReport['reason'];
}

function report(input: ReportInput): ConversationAcceptanceReport {
  return {
    version: 1,
    profileId: input.options.profileId,
    startedAt: input.startedAt,
    completedAt: new Date(input.now()).toISOString(),
    createdConversationIds:
      input.seedConversationId === undefined ? [] : [input.seedConversationId],
    discovery: {
      pageSize: input.pageSize,
      maxPages: input.maxPages,
      pages: input.pages,
      seedFound: input.seedFound,
      duplicateCount: input.duplicateCount,
      paginationExercised: input.paginationExercised,
    },
    continuation: {
      attempted: input.continuationAttempted,
      sameConversationId: input.sameConversationId,
      markerPresent: input.continuationMarkerPresent,
      reopenedLastResponseMarkerPresent: input.reopenedLastResponseMarkerPresent,
    },
    status: input.status,
    passed: input.status === 'PASS',
    conclusive: input.status !== 'INCONCLUSIVE',
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

function classifyError(error: unknown): ExecutionErrorCode | 'INTERNAL_ERROR' {
  return error instanceof WebAutomationError ? error.code : 'INTERNAL_ERROR';
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} must be a positive integer.`);
  }
}
