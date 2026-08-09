import type {
  AskRequest,
  AskResult,
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

export interface AutomationApplicationPort {
  ask(request: AskRequest): Promise<AskResult>;
  sessionStatus(request: SessionStatusRequest): Promise<SessionStatusResult>;
}
