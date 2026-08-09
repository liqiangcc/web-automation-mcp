import { describe, expect, it } from 'vitest';

import type {
  AskRequest,
  AskResult,
  AskToFileRequest,
  AskToFileResult,
} from '../../src/domain/conversation.js';
import { WebAutomationError } from '../../src/domain/errors.js';
import type {
  AutomationApplicationPort,
  LastResponseRequest,
  NewChatRequest,
  SessionStatusRequest,
} from '../../src/ports/automation-application-port.js';
import type {
  ConversationCatalogApplicationPort,
  ListConversationsRequest,
  ListConversationsResult,
} from '../../src/ports/conversation-catalog-port.js';
import type {
  ConversationExportApplicationPort,
  ExportConversationRequest,
} from '../../src/ports/conversation-export-port.js';
import type {
  ConversationReaderApplicationPort,
  GetConversationRequest,
} from '../../src/ports/conversation-reader-port.js';
import { runConversationAcceptance } from '../../src/validation/conversation-acceptance.js';

type PageFixture = readonly {
  readonly conversationId: string;
  readonly title: string;
}[];

class FakeConversationApplication
  implements
    AutomationApplicationPort,
    ConversationCatalogApplicationPort,
    ConversationReaderApplicationPort,
    ConversationExportApplicationPort
{
  private seedMarker = '';
  private continuationMarker = '';

  public constructor(private readonly pages: readonly PageFixture[]) {}

  public async ask(request: AskRequest): Promise<AskResult> {
    const marker = request.prompt.match(/WEB_AUTOMATION_CONVERSATION_[A-Z]+::\d+/)?.[0] ?? '';
    if (request.conversationId === undefined) {
      this.seedMarker = marker;
      return {
        provider: request.provider,
        profileId: request.profileId,
        conversationId: 'seed-conversation',
        responseText: marker,
      };
    }

    this.continuationMarker = marker;
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      responseText: marker,
    };
  }

  public async askToFile(request: AskToFileRequest): Promise<AskToFileResult> {
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: 'unused',
      filePath: request.outputPath,
      bytesWritten: 0,
      sha256: '',
    };
  }

  public async sessionStatus(request: SessionStatusRequest) {
    return {
      provider: request.provider,
      profileId: request.profileId,
      status: 'AUTHENTICATED' as const,
    };
  }

  public async newChat(request: NewChatRequest) {
    return { provider: request.provider, profileId: request.profileId, status: 'READY' as const };
  }

  public async getLastResponse(request: LastResponseRequest) {
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      responseText: this.continuationMarker,
    };
  }

  public async getConversation(request: GetConversationRequest) {
    const messages = [
      { role: 'user' as const, text: `Seed request ${this.seedMarker}` },
      { role: 'assistant' as const, text: this.seedMarker },
    ];
    if (this.continuationMarker.length > 0) {
      messages.push(
        { role: 'user' as const, text: `Continue request ${this.continuationMarker}` },
        { role: 'assistant' as const, text: this.continuationMarker },
      );
    }
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      messages,
    };
  }

  public async exportConversationToFile(request: ExportConversationRequest) {
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      filePath: request.outputPath,
      messageCount: this.continuationMarker.length > 0 ? 4 : 2,
      bytesWritten: 256,
      sha256: 'abc123',
    };
  }

  public async listConversations(
    request: ListConversationsRequest,
  ): Promise<ListConversationsResult> {
    const pageIndex = request.cursor === undefined ? 0 : Number(request.cursor.replace('page-', ''));
    const conversations = this.pages[pageIndex] ?? [];
    const hasNext = pageIndex + 1 < this.pages.length;
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversations,
      ...(hasNext ? { nextCursor: `page-${pageIndex + 1}` } : {}),
    };
  }
}

class RateLimitedConversationApplication extends FakeConversationApplication {
  public constructor() {
    super([]);
  }

  public override async listConversations(): Promise<ListConversationsResult> {
    throw new WebAutomationError('PROVIDER_RATE_LIMITED', 'rate limited');
  }
}

describe('conversation acceptance', () => {
  it('passes when pagination, full reading, continuation, export and reopen all agree', async () => {
    let clock = 0;
    const application = new FakeConversationApplication([
      [
        { conversationId: 'c1', title: 'First' },
        { conversationId: 'c2', title: 'Second' },
      ],
      [
        { conversationId: 'seed-conversation', title: 'Seed' },
        { conversationId: 'c3', title: 'Third' },
      ],
    ]);

    const report = await runConversationAcceptance(application, {
      profileId: 'default',
      pageSize: 2,
      maxPages: 3,
      now: () => (clock += 100),
    });

    expect(report.status).toBe('PASS');
    expect(report.passed).toBe(true);
    expect(report.discovery).toMatchObject({
      seedFound: true,
      duplicateCount: 0,
      paginationExercised: true,
    });
    expect(report.reading).toEqual({
      initialAttempted: true,
      initialMarkerPresent: true,
      initialMessageCount: 2,
      continuedAttempted: true,
      continuedMarkerPresent: true,
      continuedMessageCount: 4,
    });
    expect(report.continuation).toEqual({
      attempted: true,
      sameConversationId: true,
      markerPresent: true,
      reopenedLastResponseMarkerPresent: true,
    });
    expect(report.export).toEqual({
      attempted: true,
      outputPath: 'validation/conversation-export-100.md',
      messageCount: 4,
      bytesWritten: 256,
      sha256Present: true,
    });
    expect(report.createdConversationIds).toEqual(['seed-conversation']);
  });

  it('is inconclusive when read/continue/export work but there is no second cursor page', async () => {
    let clock = 0;
    const application = new FakeConversationApplication([
      [{ conversationId: 'seed-conversation', title: 'Seed' }],
    ]);

    const report = await runConversationAcceptance(application, {
      profileId: 'default',
      now: () => (clock += 100),
    });

    expect(report.status).toBe('INCONCLUSIVE');
    expect(report.passed).toBe(false);
    expect(report.conclusive).toBe(false);
    expect(report.reason).toBe('pagination_not_exercised');
    expect(report.reading.continuedMarkerPresent).toBe(true);
    expect(report.export.attempted).toBe(true);
    expect(report.continuation.reopenedLastResponseMarkerPresent).toBe(true);
  });

  it('is inconclusive when the provider rate limits discovery after creating the seed', async () => {
    let clock = 0;
    const report = await runConversationAcceptance(new RateLimitedConversationApplication(), {
      profileId: 'default',
      now: () => (clock += 100),
    });

    expect(report.status).toBe('INCONCLUSIVE');
    expect(report.passed).toBe(false);
    expect(report.conclusive).toBe(false);
    expect(report.reason).toBe('provider_rate_limited');
    expect(report.errorCode).toBe('PROVIDER_RATE_LIMITED');
    expect(report.createdConversationIds).toEqual(['seed-conversation']);
    expect(report.reading.initialAttempted).toBe(false);
    expect(report.continuation.attempted).toBe(false);
    expect(report.export.attempted).toBe(false);
  });

  it('fails before reading when pagination returns duplicate conversation ids', async () => {
    let clock = 0;
    const application = new FakeConversationApplication([
      [
        { conversationId: 'c1', title: 'First' },
        { conversationId: 'c2', title: 'Second' },
      ],
      [
        { conversationId: 'c2', title: 'Second duplicate' },
        { conversationId: 'seed-conversation', title: 'Seed' },
      ],
    ]);

    const report = await runConversationAcceptance(application, {
      profileId: 'default',
      pageSize: 2,
      maxPages: 3,
      now: () => (clock += 100),
    });

    expect(report.status).toBe('FAIL');
    expect(report.reason).toBe('duplicate_conversation_ids');
    expect(report.discovery.duplicateCount).toBe(1);
    expect(report.reading.initialAttempted).toBe(false);
    expect(report.continuation.attempted).toBe(false);
    expect(report.export.attempted).toBe(false);
  });
});
