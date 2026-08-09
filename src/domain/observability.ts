import type { ProfileId, ProviderId } from './conversation.js';
import type { ExecutionErrorCode } from './errors.js';

export type AutomationOperation =
  'ask' | 'ask_to_file' | 'session_status' | 'new_chat' | 'get_last_response';

export type LifecyclePhase = 'START' | 'SUCCESS' | 'FAILURE';
export type ObservabilityErrorCode = ExecutionErrorCode | 'INTERNAL_ERROR';

export interface SafeRequestContext {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly hasConversationId: boolean;
}

export interface LifecycleEvent extends SafeRequestContext {
  readonly requestId: string;
  readonly operation: AutomationOperation;
  readonly phase: LifecyclePhase;
  readonly timestamp: string;
  readonly durationMs?: number;
  readonly errorCode?: ObservabilityErrorCode;
}

export interface DiagnosticsBundle extends SafeRequestContext {
  readonly version: 1;
  readonly requestId: string;
  readonly operation: AutomationOperation;
  readonly timestamp: string;
  readonly durationMs: number;
  readonly errorCode: ObservabilityErrorCode;
}
