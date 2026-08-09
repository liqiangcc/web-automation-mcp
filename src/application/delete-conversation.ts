import { WebAutomationError } from '../domain/errors.js';
import type {
  ConversationMutationApplicationPort,
  ConversationMutationPort,
  DeleteConversationRequest,
  DeleteConversationResult,
} from '../ports/conversation-mutation-port.js';

export class DeleteConversationUseCase implements ConversationMutationApplicationPort {
  public constructor(private readonly mutations: ReadonlyMap<string, ConversationMutationPort>) {}

  public async deleteConversation(
    request: DeleteConversationRequest,
  ): Promise<DeleteConversationResult> {
    if (request.conversationId.trim().length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'conversationId must not be empty.');
    }

    const mutation = this.mutations.get(request.provider);
    if (mutation === undefined) {
      throw new WebAutomationError(
        'UNSUPPORTED_PROVIDER',
        `No conversation mutation provider is configured for ${request.provider}.`,
      );
    }

    await mutation.delete({
      profileId: request.profileId,
      conversationId: request.conversationId,
    });

    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      deleted: true,
    };
  }
}
