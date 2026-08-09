import { describe, expect, it } from 'vitest';

import type {
  AskRequest,
  AskResult,
  AskToFileRequest,
  AskToFileResult,
} from '../../src/domain/conversation.js';
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
import { runConversationAcceptance } from '../../src/validation/conversation-acceptance.js';

type PageFixture = readonly {
  readonly conversationId: string;
  readonly title: string;
}[];

class FakeConversationApplication
  implements AutomationApplicationPort, ConversationCatalogApplicationPort
{
  private continuationMarker = '';

  public constructor(private readonly pages: readonly PageFixture[]) {}

  public async ask(request: AskRequest): Promise<AskResult> {
    const marker = request.prompt.match(/WEB_AUTOMATION_CONVERSATION_[A-Z]+::\d+/)?.[0] ?? '';
    if (request.conversationId === undefined) {
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

describe('conversation acceptance', () => {
  it('passes when pagination discovers the disposable seed and continuation reopens correctly', async () => {
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
    expect(report.continuation).toEqual({
      attempted: true,
      sameConversationId: true,
      markerPresent: true,
      reopenedLastResponseMarkerPresent: true,
    });
    expect(report.createdConversationIds).toEqual(['seed-conversation']);
  });

  it('is inconclusive when discovery works but there are not enough conversations for a cursor page', async () => {
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
    expect(report.continuation.reopenedLastResponseMarkerPresent).toBe(true);
  });

  it('fails before continuation when pagination returns duplicate conversation ids', async () => {
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
    expect(report.continuation.attempted).toBe(false);
  });
});
