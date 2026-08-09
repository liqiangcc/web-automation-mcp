import type {
  AskRequest,
  AskResult,
  ConversationId,
  ProfileId,
  ProviderId,
} from '../domain/conversation.js';
import type { SessionStatus } from './session-probe.js';

export interface SessionStatusRequest {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
}

export interface SessionStatusResult {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly status: SessionStatus;
}

export interface NewChatRequest {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
}

export interface NewChatResult {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly status: 'READY';
}

export interface LastResponseRequest {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
}

export interface LastResponseResult {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
  readonly responseText: string;
}

export interface AutomationApplicationPort {
  ask(request: AskRequest): Promise<AskResult>;
  sessionStatus(request: SessionStatusRequest): Promise<SessionStatusResult>;
  newChat(request: NewChatRequest): Promise<NewChatResult>;
  getLastResponse(request: LastResponseRequest): Promise<LastResponseResult>;
}
