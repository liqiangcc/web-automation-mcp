export type SessionStatus =
  | 'AUTHENTICATED'
  | 'AUTH_REQUIRED'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN';

export type ResponseCompletionPath = 'fast' | 'fallback';

export interface ResponseCompletionMetadata {
  readonly path: ResponseCompletionPath;
  /** Time spent inside completion detection, from submission baseline to completed response. */
  readonly waitMs: number;
  /** Time from the final completion candidate to the completed return. */
  readonly latencyMs: number;
}

export type ExecutionStage =
  | 'ACQUIRE_PROFILE'
  | 'PROBE_SESSION'
  | 'OPEN_OR_RESUME_CONVERSATION'
  | 'CAPTURE_RESPONSE_BASELINE'
  | 'RESOLVE_PROMPT_INPUT'
  | 'SUBMIT_PROMPT'
  | 'WAIT_FOR_NEW_ASSISTANT_RESPONSE'
  | 'WAIT_FOR_COMPLETION'
  | 'EXTRACT_RESPONSE'
  | 'RETURN';
