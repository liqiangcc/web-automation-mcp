import type { BrowserPagePort, LocatorCandidate } from '../../ports/browser-port.js';
import type { SessionProbe, SessionStatus } from '../../ports/session-probe.js';

const LOGIN_TARGETS: readonly LocatorCandidate[] = [
  { kind: 'role', role: 'link', name: 'Log in' },
  { kind: 'role', role: 'button', name: 'Log in' },
];

const PROMPT_TARGETS: readonly LocatorCandidate[] = [
  { kind: 'css', value: '#prompt-textarea' },
  { kind: 'placeholder', text: 'Ask anything' },
];

export class ChatGptSessionProbe implements SessionProbe {
  public constructor(private readonly page: BrowserPagePort) {}

  public async check(): Promise<SessionStatus> {
    try {
      if (await anyVisible(this.page, LOGIN_TARGETS)) {
        return 'AUTH_REQUIRED';
      }

      if (await anyVisible(this.page, PROMPT_TARGETS)) {
        return 'AUTHENTICATED';
      }

      return 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }
}

async function anyVisible(
  page: BrowserPagePort,
  candidates: readonly LocatorCandidate[],
): Promise<boolean> {
  for (const candidate of candidates) {
    if (await page.isVisible(candidate)) {
      return true;
    }
  }
  return false;
}
