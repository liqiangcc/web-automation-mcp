import type { ProviderId } from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';
import type {
  LastResponseRequest,
  LastResponseResult,
  NewChatRequest,
  NewChatResult,
} from '../ports/automation-application-port.js';
import type { ProviderConversationPort } from '../ports/provider-conversation-port.js';

export class ConversationUseCases {
  public constructor(
    private readonly providers: ReadonlyMap<ProviderId, ProviderConversationPort>,
  ) {}

  public async newChat(request: NewChatRequest): Promise<NewChatResult> {
    const provider = this.requireProvider(request.provider);
    const result = await provider.newChat(request.profileId);

    return {
      provider: request.provider,
      profileId: request.profileId,
      status: result.status,
    };
  }

  public async getLastResponse(request: LastResponseRequest): Promise<LastResponseResult> {
    const provider = this.requireProvider(request.provider);
    const result = await provider.getLastResponse({
      profileId: request.profileId,
      conversationId: request.conversationId,
    });

    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      responseText: result.responseText,
    };
  }

  private requireProvider(providerId: ProviderId): ProviderConversationPort {
    const provider = this.providers.get(providerId);
    if (provider === undefined) {
      throw new WebAutomationError(
        'UNSUPPORTED_PROVIDER',
        `Provider is not registered for conversation operations: ${providerId}`,
      );
    }
    return provider;
  }
}
