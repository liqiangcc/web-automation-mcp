import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort } from '../../ports/browser-port.js';
import { ChatGptSessionProbe } from './session-probe.js';

export interface AuthenticationWaitOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly now?: () => number;
  readonly sleep?: (delayMs: number) => Promise<void>;
}

export async function requireAuthenticatedChatGptSession(
  page: BrowserPagePort,
  options: AuthenticationWaitOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const probe = new ChatGptSessionProbe(page);
  const deadline = now() + timeoutMs;
  let sessionStatus = await probe.check();

  while (sessionStatus !== 'AUTHENTICATED' && now() < deadline) {
    await sleep(pollIntervalMs);
    sessionStatus = await probe.check();
  }

  if (sessionStatus === 'AUTH_REQUIRED') {
    throw new WebAutomationError('AUTH_REQUIRED', 'ChatGPT browser profile is not authenticated');
  }
  if (sessionStatus === 'UNKNOWN') {
    throw new WebAutomationError(
      'PROVIDER_UNAVAILABLE',
      'ChatGPT page is not in a recognized authenticated state',
    );
  }
}
