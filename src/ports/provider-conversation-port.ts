import type { ConversationId, ProfileId, ProviderId } from '../domain/conversation.js';

export interface ProviderNewChatOutput {
  readonly status: 'READY';
}

export interface ProviderLastResponseInput {
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
}

export interface ProviderLastResponseOutput {
  readonly responseText: string;
}

export interface ProviderConversationPort {
  readonly id: ProviderId;
  newChat(profileId: ProfileId): Promise<ProviderNewChatOutput>;
  getLastResponse(input: ProviderLastResponseInput): Promise<ProviderLastResponseOutput>;
}
