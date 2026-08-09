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
} from '../../src/ports/conversation-catalog-port.js';
import type {
  ConversationMutationApplicationPort,
  DeleteConversationRequest,
} from '../../src/ports/conversation-mutation-port.js';
import type {
  ConversationReaderApplicationPort,
  GetConversationRequest,
} from '../../src/ports/conversation-reader-port.js';
import { runConversationCleanupAcceptance } from '../../src/validation/conversation-cleanup-acceptance.js';

class FakeCleanupApplication
  implements
    AutomationApplicationPort,
    ConversationCatalogApplicationPort,
    ConversationReaderApplicationPort,
    ConversationMutationApplicationPort
{
  private askCount = 0;
  private readonly ids = new Set<string>();
  private readonly markers = new Map<string, string>();

  public async ask(request: AskRequest): Promise<AskResult> {
    this.askCount += 1;
    const id = this.askCount === 1 ? 'target-id' : 'survivor-id';
    const marker = request.prompt.match(/WEB_AUTOMATION_CLEANUP_[A-Z]+::\d+/)?.[0] ?? '';
    this.ids.add(id);
    this.markers.set(id, marker);
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: id,
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
    return { provider: request.provider, profileId: request.profileId, status: 'AUTHENTICATED' as const };
  }

  public async newChat(request: NewChatRequest) {
    return { provider: request.provider, profileId: request.profileId, status: 'READY' as const };
  }

  public async getLastResponse(request: LastResponseRequest) {
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      responseText: this.markers.get(request.conversationId) ?? '',
    };
  }

  public async listConversations(request: ListConversationsRequest) {
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversations: [...this.ids].map((conversationId) => ({ conversationId, title: 'Disposable' })),
    };
  }

  public async getConversation(request: GetConversationRequest) {
    if (!this.ids.has(request.conversationId)) {
      throw new WebAutomationError('CONVERSATION_NOT_FOUND', 'missing');
    }
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      messages: [
        { role: 'assistant' as const, text: this.markers.get(request.conversationId) ?? '' },
      ],
    };
  }

  public async deleteConversation(request: DeleteConversationRequest) {
    if (!this.ids.delete(request.conversationId)) {
      throw new WebAutomationError('CONVERSATION_NOT_FOUND', 'already absent');
    }
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      deleted: true as const,
    };
  }
}

describe('conversation cleanup acceptance', () => {
  it('deletes only the target, proves the survivor remains, then cleans the survivor', async () => {
    let clock = 0;
    const report = await runConversationCleanupAcceptance(new FakeCleanupApplication(), {
      profileId: 'default',
      now: () => (clock += 100),
    });

    expect(report.status).toBe('PASS');
    expect(report.preflight).toEqual({ targetPresent: true, survivorPresent: true });
    expect(report.targetDelete).toEqual({
      attempted: true,
      deleted: true,
      targetAbsentAfterDelete: true,
      survivorPresentAfterDelete: true,
      repeatDeleteReturnedNotFound: true,
    });
    expect(report.survivor).toEqual({
      markerPresentAfterTargetDelete: true,
      cleanupAttempted: true,
      cleanupDeleted: true,
      absentAfterCleanup: true,
    });
    expect(report.createdConversationIds).toEqual(['target-id', 'survivor-id']);
  });
});
