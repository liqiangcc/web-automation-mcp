import type { SessionProbe, SessionStatus } from '../ports/session-probe.js';

export interface WaitForAuthenticatedOptions {
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
  readonly now?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void>;
  readonly onStatus?: (status: SessionStatus) => void;
}

export class SessionManager {
  public constructor(private readonly probe: SessionProbe) {}

  public check(): Promise<SessionStatus> {
    return this.probe.check();
  }

  public async waitForAuthenticated(options: WaitForAuthenticatedOptions): Promise<SessionStatus> {
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? defaultSleep;
    const deadline = now() + options.timeoutMs;

    let status = await this.check();
    options.onStatus?.(status);

    while (status !== 'AUTHENTICATED' && now() < deadline) {
      await sleep(options.pollIntervalMs);
      status = await this.check();
      options.onStatus?.(status);
    }

    return status;
  }
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
