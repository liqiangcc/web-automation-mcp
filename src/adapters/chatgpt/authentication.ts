import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort } from '../../ports/browser-port.js';
import { ChatGptSessionProbe } from './session-probe.js';

export async function requireAuthenticatedChatGptSession(
  page: BrowserPagePort,
): Promise<void> {
  const sessionStatus = await new ChatGptSessionProbe(page).check();
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
