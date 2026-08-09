import { WebAutomationError, type ExecutionErrorCode } from '../domain/errors.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';
import type { ConversationCatalogApplicationPort } from '../ports/conversation-catalog-port.js';
import type { ConversationExportApplicationPort } from '../ports/conversation-export-port.js';
import type { ConversationReaderApplicationPort } from '../ports/conversation-reader-port.js';

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
  readonly reading: {
    readonly initialAttempted: boolean;
    readonly initialMarkerPresent: boolean;
    readonly initialMessageCount: number;
    readonly continuedAttempted: boolean;
    readonly continuedMarkerPresent: boolean;
    readonly continuedMessageCount: number;
  };
  readonly continuation: {
    readonly attempted: boolean;
    readonly sameConversationId: boolean;
    readonly markerPresent: boolean;
    readonly reopenedLastResponseMarkerPresent: boolean;
  };
  readonly export: {
    readonly attempted: boolean;
    readonly outputPath?: string;
    readonly messageCount: number;
    readonly bytesWritten: number;
    readonly sha256Present: boolean;
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
    | 'provider_rate_limited'
    | 'initial_transcript_missing_seed'
    | 'continuation_changed_conversation'
    | 'continuation_response_incomplete'
    | 'continued_transcript_missing_marker'
    | 'continued_transcript_not_extended'
    | 'export_metadata_mismatch'
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
  application: AutomationApplicationPort &
    ConversationCatalogApplicationPort &
    ConversationReaderApplicationPort &
    ConversationExportApplicationPort,
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
  const exportOutputPath = `validation/conversation-export-${runId}.md`;
  const pages: ConversationAcceptancePageResult[] = [];
  const seenConversationIds = new Set<string>();
  let duplicateCount = 0;
  let seedConversationId: string | undefined;
  let seedFound = false;
  let paginationExercised = false;
  let initialReadAttempted = false;
  let initialReadMarkerPresent = false;
  let initialMessageCount = 0;
  let continuedReadAttempted = false;
  let continuedReadMarkerPresent = false;
  let continuedMessageCount = 0;
  let continuationAttempted = false;
  let sameConversationId = false;
  let continuationMarkerPresent = false;
  let reopenedLastResponseMarkerPresent = false;
  let exportAttempted = false;
  let exportedMessageCount = 0;
  let exportedBytesWritten = 0;
  let exportSha256Present = false;

  const baseReport = (
    status: ConversationAcceptanceStatus,
    reason?: ConversationAcceptanceReport['reason'],
  ): ConversationAcceptanceReport =>
    report({
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
      initialReadAttempted,
      initialReadMarkerPresent,
      initialMessageCount,
      continuedReadAttempted,
      continuedReadMarkerPresent,
      continuedMessageCount,
      continuationAttempted,
      sameConversationId,
      continuationMarkerPresent,
      reopenedLastResponseMarkerPresent,
      exportAttempted,
      ...(exportAttempted ? { exportOutputPath } : {}),
      exportedMessageCount,
      exportedBytesWritten,
      exportSha256Present,
      status,
      ...(reason === undefined ? {} : { reason }),
    });

  try {
    const seed = await application.ask({
      provider: 'chatgpt',
      profileId: options.profileId,
      prompt: `Reply with exactly this marker and nothing else: ${seedMarker}`,
    });
    seedConversationId = seed.conversationId;

    if (!seed.responseText.includes(seedMarker)) {
      return baseReport('FAIL', 'seed_response_incomplete');
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
        return baseReport('FAIL', 'duplicate_conversation_ids');
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

    if (!seedFound || seedConversationId === undefined) {
      return baseReport('FAIL', 'seed_not_discovered');
    }

    initialReadAttempted = true;
    const initialTranscript = await application.getConversation({
      provider: 'chatgpt',
      profileId: options.profileId,
      conversationId: seedConversationId,
    });
    initialMessageCount = initialTranscript.messages.length;
    initialReadMarkerPresent = hasAssistantMarker(initialTranscript.messages, seedMarker);
    if (!initialReadMarkerPresent) {
      return baseReport('FAIL', 'initial_transcript_missing_seed');
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
      return baseReport('FAIL', 'continuation_changed_conversation');
    }

    if (!continuationMarkerPresent) {
      return baseReport('FAIL', 'continuation_response_incomplete');
    }

    continuedReadAttempted = true;
    const continuedTranscript = await application.getConversation({
      provider: 'chatgpt',
      profileId: options.profileId,
      conversationId: seedConversationId,
    });
    continuedMessageCount = continuedTranscript.messages.length;
    continuedReadMarkerPresent = hasAssistantMarker(continuedTranscript.messages, continuationMarker);
    if (!continuedReadMarkerPresent) {
      return baseReport('FAIL', 'continued_transcript_missing_marker');
    }
    if (continuedMessageCount <= initialMessageCount) {
      return baseReport('FAIL', 'continued_transcript_not_extended');
    }

    exportAttempted = true;
    const exported = await application.exportConversationToFile({
      provider: 'chatgpt',
      profileId: options.profileId,
      conversationId: seedConversationId,
      outputPath: exportOutputPath,
      overwrite: false,
    });
    exportedMessageCount = exported.messageCount;
    exportedBytesWritten = exported.bytesWritten;
    exportSha256Present = exported.sha256.length > 0;
    if (
      exported.conversationId !== seedConversationId ||
      exportedMessageCount !== continuedMessageCount ||
      exportedBytesWritten <= 0 ||
      !exportSha256Present
    ) {
      return baseReport('FAIL', 'export_metadata_mismatch');
    }

    const reopened = await application.getLastResponse({
      provider: 'chatgpt',
      profileId: options.profileId,
      conversationId: seedConversationId,
    });
    reopenedLastResponseMarkerPresent = reopened.responseText.includes(continuationMarker);

    if (!reopenedLastResponseMarkerPresent) {
      return baseReport('FAIL', 'reopened_response_mismatch');
    }

    return baseReport(
      paginationExercised ? 'PASS' : 'INCONCLUSIVE',
      paginationExercised ? undefined : 'pagination_not_exercised',
    );
  } catch (error) {
    if (error instanceof WebAutomationError && error.code === 'PROVIDER_RATE_LIMITED') {
      return {
        ...baseReport('INCONCLUSIVE', 'provider_rate_limited'),
        errorCode: error.code,
      };
    }

    return {
      ...baseReport('ERROR'),
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
  readonly initialReadAttempted: boolean;
  readonly initialReadMarkerPresent: boolean;
  readonly initialMessageCount: number;
  readonly continuedReadAttempted: boolean;
  readonly continuedReadMarkerPresent: boolean;
  readonly continuedMessageCount: number;
  readonly continuationAttempted: boolean;
  readonly sameConversationId: boolean;
  readonly continuationMarkerPresent: boolean;
  readonly reopenedLastResponseMarkerPresent: boolean;
  readonly exportAttempted: boolean;
  readonly exportOutputPath?: string;
  readonly exportedMessageCount: number;
  readonly exportedBytesWritten: number;
  readonly exportSha256Present: boolean;
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
    reading: {
      initialAttempted: input.initialReadAttempted,
      initialMarkerPresent: input.initialReadMarkerPresent,
      initialMessageCount: input.initialMessageCount,
      continuedAttempted: input.continuedReadAttempted,
      continuedMarkerPresent: input.continuedReadMarkerPresent,
      continuedMessageCount: input.continuedMessageCount,
    },
    continuation: {
      attempted: input.continuationAttempted,
      sameConversationId: input.sameConversationId,
      markerPresent: input.continuationMarkerPresent,
      reopenedLastResponseMarkerPresent: input.reopenedLastResponseMarkerPresent,
    },
    export: {
      attempted: input.exportAttempted,
      ...(input.exportOutputPath === undefined ? {} : { outputPath: input.exportOutputPath }),
      messageCount: input.exportedMessageCount,
      bytesWritten: input.exportedBytesWritten,
      sha256Present: input.exportSha256Present,
    },
    status: input.status,
    passed: input.status === 'PASS',
    conclusive: input.status !== 'INCONCLUSIVE',
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

function hasAssistantMarker(
  messages: readonly { readonly role: string; readonly text: string }[],
  marker: string,
): boolean {
  return messages.some((message) => message.role === 'assistant' && message.text.includes(marker));
}

function classifyError(error: unknown): ExecutionErrorCode | 'INTERNAL_ERROR' {
  return error instanceof WebAutomationError ? error.code : 'INTERNAL_ERROR';
}

function assertPositiveInteger(name: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${name} must be a positive integer.`);
  }
}
