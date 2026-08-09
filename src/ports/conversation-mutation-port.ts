import type { ConversationId, ProfileId, ProviderId } from '../domain/conversation.js';

export interface ConversationMutationInput {
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
}

export interface ConversationMutationPort {
  readonly id: ProviderId;
  delete(input: ConversationMutationInput): Promise<void>;
}

export interface DeleteConversationRequest {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
}

export interface DeleteConversationResult {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
  readonly deleted: true;
}

export interface ConversationMutationApplicationPort {
  deleteConversation(request: DeleteConversationRequest): Promise<DeleteConversationResult>;
}
