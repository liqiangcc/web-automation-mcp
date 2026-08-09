import { describe, expect, it } from 'vitest';

import { DeleteConversationUseCase } from '../../src/application/delete-conversation.js';
import { WebAutomationError } from '../../src/domain/errors.js';
import type {
  ConversationMutationInput,
  ConversationMutationPort,
} from '../../src/ports/conversation-mutation-port.js';

class FakeMutation implements ConversationMutationPort {
  public readonly id = 'chatgpt' as const;
  public input: ConversationMutationInput | undefined;

  public async delete(input: ConversationMutationInput): Promise<void> {
    this.input = input;
  }
}

describe('DeleteConversationUseCase', () => {
  it('passes only the explicit requested conversation id to the mutation port', async () => {
    const mutation = new FakeMutation();
    const useCase = new DeleteConversationUseCase(new Map([[mutation.id, mutation]]));

    const result = await useCase.deleteConversation({
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'target-id',
    });

    expect(mutation.input).toEqual({ profileId: 'default', conversationId: 'target-id' });
    expect(result).toEqual({
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'target-id',
      deleted: true,
    });
  });

  it('rejects an empty destructive target before calling the mutation port', async () => {
    const mutation = new FakeMutation();
    const useCase = new DeleteConversationUseCase(new Map([[mutation.id, mutation]]));

    let caught: unknown;
    try {
      await useCase.deleteConversation({
        provider: 'chatgpt',
        profileId: 'default',
        conversationId: '   ',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WebAutomationError);
    expect((caught as WebAutomationError).code).toBe('INVALID_REQUEST');
    expect(mutation.input).toBeUndefined();
  });
});
