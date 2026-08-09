import { describe, expect, it } from 'vitest';

import { GetConversationUseCase } from '../../src/application/get-conversation.js';
import { WebAutomationError } from '../../src/domain/errors.js';
import type {
  ConversationReaderInput,
  ConversationReaderPort,
} from '../../src/ports/conversation-reader-port.js';

class FakeReader implements ConversationReaderPort {
  public readonly id = 'chatgpt' as const;

  public constructor(private readonly text: string) {}

  public async get(input: ConversationReaderInput) {
    return {
      conversationId: input.conversationId,
      messages: [
        { role: 'user' as const, text: 'Question' },
        { role: 'assistant' as const, text: this.text },
      ],
    };
  }
}

describe('GetConversationUseCase', () => {
  it('returns the provider-neutral transcript unchanged', async () => {
    const reader = new FakeReader('Answer');
    const useCase = new GetConversationUseCase(new Map([[reader.id, reader]]), 1024);

    const result = await useCase.getConversation({
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'c1',
    });

    expect(result).toEqual({
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'c1',
      messages: [
        { role: 'user', text: 'Question' },
        { role: 'assistant', text: 'Answer' },
      ],
    });
  });

  it('rejects oversized transcripts instead of silently truncating them', async () => {
    const reader = new FakeReader('x'.repeat(200));
    const useCase = new GetConversationUseCase(new Map([[reader.id, reader]]), 64);

    let caught: unknown;
    try {
      await useCase.getConversation({
        provider: 'chatgpt',
        profileId: 'default',
        conversationId: 'c1',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WebAutomationError);
    expect((caught as WebAutomationError).code).toBe('CONVERSATION_TOO_LARGE');
  });
});
