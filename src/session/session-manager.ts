import type { SessionProbe, SessionStatus } from '../ports/session-probe.js';

export class SessionManager {
  public constructor(private readonly probe: SessionProbe) {}

  public check(): Promise<SessionStatus> {
    return this.probe.check();
  }
}
