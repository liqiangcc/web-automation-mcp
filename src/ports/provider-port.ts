import type { ConversationId, ProfileId, ProviderId } from '../domain/conversation.js';
import type { ResponseCompletionMetadata } from '../domain/execution.js';

export interface ProviderAskInput {
  readonly profileId: ProfileId;
  readonly prompt: string;
  readonly conversationId?: ConversationId;
}

export interface ProviderAskOutput {
  readonly conversationId: ConversationId;
  readonly responseText: string;
  readonly completion?: ResponseCompletionMetadata;
}

export interface ProviderPort {
  readonly id: ProviderId;
  ask(input: ProviderAskInput): Promise<ProviderAskOutput>;
}
