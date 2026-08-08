import type { ConversationId, ProfileId, ProviderId } from '../domain/conversation.js';

export interface ProviderAskInput {
  readonly profileId: ProfileId;
  readonly prompt: string;
  readonly conversationId?: ConversationId;
}

export interface ProviderAskOutput {
  readonly conversationId: ConversationId;
  readonly responseText: string;
}

export interface ProviderPort {
  readonly id: ProviderId;
  ask(input: ProviderAskInput): Promise<ProviderAskOutput>;
}
