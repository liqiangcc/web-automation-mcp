export type SessionStatus =
  | 'AUTHENTICATED'
  | 'AUTH_REQUIRED'
  | 'UNKNOWN';

export interface SessionProbe {
  check(): Promise<SessionStatus>;
}
