import type { AskRequest, AskResult, ProviderId } from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';
import type { ProviderPort } from '../ports/provider-port.js';

export class AskUseCase {
  public constructor(private readonly providers: ReadonlyMap<ProviderId, ProviderPort>) {}

  public async execute(request: AskRequest): Promise<AskResult> {
    const prompt = request.prompt.trim();
    if (prompt.length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'Prompt must not be empty.');
    }

    const provider = this.providers.get(request.provider);
    if (provider === undefined) {
      throw new WebAutomationError(
        'UNSUPPORTED_PROVIDER',
        `Provider is not registered: ${request.provider}`,
      );
    }

    const result = await provider.ask({
      profileId: request.profileId,
      prompt,
      ...(request.conversationId === undefined
        ? {}
        : { conversationId: request.conversationId }),
    });

    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: result.conversationId,
      responseText: result.responseText,
    };
  }
}
