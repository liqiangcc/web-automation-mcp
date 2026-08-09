import type { ProviderId } from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';
import type {
  ConversationCatalogApplicationPort,
  ConversationCatalogPort,
  ListConversationsRequest,
  ListConversationsResult,
} from '../ports/conversation-catalog-port.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export class ListConversationsUseCase implements ConversationCatalogApplicationPort {
  public constructor(
    private readonly providers: ReadonlyMap<ProviderId, ConversationCatalogPort>,
  ) {}

  public async listConversations(
    request: ListConversationsRequest,
  ): Promise<ListConversationsResult> {
    const limit = request.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new WebAutomationError(
        'INVALID_REQUEST',
        `Conversation list limit must be an integer between 1 and ${MAX_LIMIT}.`,
      );
    }

    const provider = this.providers.get(request.provider);
    if (provider === undefined) {
      throw new WebAutomationError(
        'UNSUPPORTED_PROVIDER',
        `Provider is not registered for conversation listing: ${request.provider}`,
      );
    }

    const page = await provider.list({
      profileId: request.profileId,
      limit,
      ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
    });

    return {
      provider: request.provider,
      profileId: request.profileId,
      conversations: page.conversations,
      ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
    };
  }
}
