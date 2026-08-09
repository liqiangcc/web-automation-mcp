import type {
  ConversationId,
  ConversationTranscript,
  ProfileId,
  ProviderId,
} from '../domain/conversation.js';

export interface ConversationReaderInput {
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
}

export interface ConversationReaderPort {
  readonly id: ProviderId;
  get(input: ConversationReaderInput): Promise<ConversationTranscript>;
}

export interface GetConversationRequest {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
}

export interface GetConversationResult {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
  readonly title?: string;
  readonly messages: ConversationTranscript['messages'];
}

export interface ConversationReaderApplicationPort {
  getConversation(request: GetConversationRequest): Promise<GetConversationResult>;
}
