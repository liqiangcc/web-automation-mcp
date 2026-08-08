export type ProviderId = 'chatgpt';
export type ProfileId = string;
export type ConversationId = string;

export interface AskRequest {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly prompt: string;
  readonly conversationId?: ConversationId;
}

export interface AskResult {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
  readonly responseText: string;
}
