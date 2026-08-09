import { describe, expect, it } from 'vitest';

import { AskUseCase } from '../../src/application/ask.js';
import type { ProviderAskInput, ProviderPort } from '../../src/ports/provider-port.js';

class FakeChatGptProvider implements ProviderPort {
  public readonly id = 'chatgpt' as const;
  public lastInput: ProviderAskInput | undefined;

  public async ask(input: ProviderAskInput) {
    this.lastInput = input;
    return {
      conversationId: input.conversationId ?? 'conversation-1',
      responseText: 'fake response',
      completion: {
        path: 'fast' as const,
        waitMs: 1_200,
        latencyMs: 400,
      },
    };
  }
}

describe('AskUseCase', () => {
  it('delegates semantic ask behavior to the provider port and preserves safe execution metadata', async () => {
    const provider = new FakeChatGptProvider();
    const useCase = new AskUseCase(new Map([['chatgpt', provider]]));

    const result = await useCase.execute({
      provider: 'chatgpt',
      profileId: 'chatgpt-default',
      prompt: '  explain ports and adapters  ',
    });

    expect(provider.lastInput).toEqual({
      profileId: 'chatgpt-default',
      prompt: 'explain ports and adapters',
    });
    expect(result).toEqual({
      provider: 'chatgpt',
      profileId: 'chatgpt-default',
      conversationId: 'conversation-1',
      responseText: 'fake response',
      completion: {
        path: 'fast',
        waitMs: 1_200,
        latencyMs: 400,
      },
    });
  });

  it('rejects an empty prompt before calling a provider', async () => {
    const provider = new FakeChatGptProvider();
    const useCase = new AskUseCase(new Map([['chatgpt', provider]]));

    await expect(
      useCase.execute({
        provider: 'chatgpt',
        profileId: 'chatgpt-default',
        prompt: '   ',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    expect(provider.lastInput).toBeUndefined();
  });
});
