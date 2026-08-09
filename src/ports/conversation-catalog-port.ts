import type {
  ConversationCursor,
  ConversationPage,
  ProfileId,
  ProviderId,
} from '../domain/conversation.js';

export interface ConversationCatalogInput {
  readonly profileId: ProfileId;
  readonly limit: number;
  readonly cursor?: ConversationCursor;
}

export interface ConversationCatalogPort {
  readonly id: ProviderId;
  list(input: ConversationCatalogInput): Promise<ConversationPage>;
}

export interface ListConversationsRequest {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly limit?: number;
  readonly cursor?: ConversationCursor;
}

export interface ListConversationsResult {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversations: ConversationPage['conversations'];
  readonly nextCursor?: ConversationCursor;
}

export interface ConversationCatalogApplicationPort {
  listConversations(request: ListConversationsRequest): Promise<ListConversationsResult>;
}
