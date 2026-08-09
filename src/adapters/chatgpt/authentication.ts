import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort } from '../../ports/browser-port.js';
import { ChatGptPageHealthProbe } from './page-health.js';
import { ChatGptSessionProbe } from './session-probe.js';

const DEFAULT_UNKNOWN_STABILIZATION_TIMEOUT_MS = 5_000;
const DEFAULT_POLL_INTERVAL_MS = 250;

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
  const timeoutMs = options.timeoutMs ?? DEFAULT_UNKNOWN_STABILIZATION_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const probe = new ChatGptSessionProbe(page);
  const deadline = now() + timeoutMs;
  let sessionStatus = await probe.check();

  if (sessionStatus === 'AUTH_REQUIRED') {
    throwAuthRequired();
  }

  while (sessionStatus === 'UNKNOWN' && now() < deadline) {
    await sleep(pollIntervalMs);
    sessionStatus = await probe.check();
    if (sessionStatus === 'AUTH_REQUIRED') {
      throwAuthRequired();
    }
  }

  if (sessionStatus === 'AUTHENTICATED') {
    return;
  }

  const health = await new ChatGptPageHealthProbe(page).check();
  if (health === 'RATE_LIMITED') {
    throw new WebAutomationError(
      'PROVIDER_RATE_LIMITED',
      'ChatGPT is temporarily limiting requests for this browser session',
    );
  }

  throw new WebAutomationError(
    'PROVIDER_UNAVAILABLE',
    'ChatGPT page is not in a recognized authenticated state',
  );
}

function throwAuthRequired(): never {
  throw new WebAutomationError('AUTH_REQUIRED', 'ChatGPT browser profile is not authenticated');
}
