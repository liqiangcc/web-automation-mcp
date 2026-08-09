import type { BrowserPagePort } from '../../ports/browser-port.js';
import type { SessionProbe, SessionStatus } from '../../ports/session-probe.js';
import { ChatGptTargetResolver } from './target-resolver.js';

export class ChatGptSessionProbe implements SessionProbe {
  private readonly resolver: ChatGptTargetResolver;

  public constructor(page: BrowserPagePort) {
    this.resolver = new ChatGptTargetResolver(page);
  }

  public async check(): Promise<SessionStatus> {
    try {
      if ((await this.resolver.find('login')) !== undefined) {
        return 'AUTH_REQUIRED';
      }

      if ((await this.resolver.find('prompt-input')) !== undefined) {
        return 'AUTHENTICATED';
      }

      return 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }
}
