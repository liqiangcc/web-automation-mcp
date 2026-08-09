import { CHATGPT_URL } from '../adapters/chatgpt/chatgpt-config.js';
import { ChatGptSessionProbe } from '../adapters/chatgpt/session-probe.js';
import type { ProfileId } from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';
import type { SessionStatusResult } from '../ports/automation-application-port.js';
import type { BrowserSessionPort } from '../ports/browser-session-port.js';

export class ChatGptSessionStatusProvider {
  public readonly id = 'chatgpt' as const;

  public constructor(private readonly sessions: BrowserSessionPort) {}

  public async check(profileId: ProfileId): Promise<SessionStatusResult> {
    const session = await this.sessions.acquire(this.id, profileId);

    try {
      try {
        await session.page.goto(CHATGPT_URL);
      } catch (error) {
        throw new WebAutomationError(
          'NAVIGATION_FAILED',
          'Failed to open ChatGPT for session status check',
          { cause: error },
        );
      }

      const status = await new ChatGptSessionProbe(session.page).check();
      return {
        provider: this.id,
        profileId,
        status,
      };
    } finally {
      await session.close();
    }
  }
}
