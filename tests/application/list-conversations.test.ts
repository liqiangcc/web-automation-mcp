import { describe, expect, it } from 'vitest';

import { ListConversationsUseCase } from '../../src/application/list-conversations.js';
import { WebAutomationError } from '../../src/domain/errors.js';
import type {
  ConversationCatalogInput,
  ConversationCatalogPort,
} from '../../src/ports/conversation-catalog-port.js';

class FakeCatalog implements ConversationCatalogPort {
  public readonly id = 'chatgpt' as const;
  public lastInput: ConversationCatalogInput | undefined;

  public async list(input: ConversationCatalogInput) {
    this.lastInput = input;
    return {
      conversations: [{ conversationId: 'c1', title: 'First' }],
      nextCursor: 'cursor-1',
    };
  }
}

describe('ListConversationsUseCase', () => {
  it('defaults to 20 and preserves the opaque next cursor', async () => {
    const catalog = new FakeCatalog();
    const useCase = new ListConversationsUseCase(new Map([[catalog.id, catalog]]));

    const result = await useCase.listConversations({ provider: 'chatgpt', profileId: 'default' });

    expect(catalog.lastInput).toEqual({ profileId: 'default', limit: 20 });
    expect(result).toEqual({
      provider: 'chatgpt',
      profileId: 'default',
      conversations: [{ conversationId: 'c1', title: 'First' }],
      nextCursor: 'cursor-1',
    });
  });

  it('rejects an unbounded list request', async () => {
    const catalog = new FakeCatalog();
    const useCase = new ListConversationsUseCase(new Map([[catalog.id, catalog]]));

    await expect(
      useCase.listConversations({ provider: 'chatgpt', profileId: 'default', limit: 51 }),
    ).rejects.toMatchObject<WebAutomationError>({ code: 'INVALID_REQUEST' });
  });
});
