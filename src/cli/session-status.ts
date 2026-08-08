import { CHATGPT_URL } from '../adapters/chatgpt/chatgpt-config.js';
import { ChatGptSessionProbe } from '../adapters/chatgpt/session-probe.js';
import { PlaywrightBrowserAdapter } from '../adapters/playwright/playwright-browser.js';
import { WebAutomationError } from '../domain/errors.js';
import type { BrowserPagePort, BrowserPort } from '../ports/browser-port.js';
import type { SessionProbe, SessionStatus } from '../ports/session-probe.js';
import { ProfileLock } from '../session/profile-lock.js';
import { ProfilePathResolver } from '../session/profile-path.js';
import { SessionManager } from '../session/session-manager.js';

export interface SessionStatusCommand {
  readonly profileId: string;
  readonly headless?: boolean;
}

export interface SessionStatusResult {
  readonly profileId: string;
  readonly status: SessionStatus;
}

export interface SessionStatusDependencies {
  readonly browser: BrowserPort;
  readonly pathResolver: Pick<ProfilePathResolver, 'resolve'>;
  readonly profileLock: Pick<ProfileLock, 'acquire'>;
  readonly createProbe: (page: BrowserPagePort) => SessionProbe;
}

export function createDefaultSessionStatusDependencies(): SessionStatusDependencies {
  return {
    browser: new PlaywrightBrowserAdapter(),
    pathResolver: new ProfilePathResolver(),
    profileLock: new ProfileLock(),
    createProbe: (page) => new ChatGptSessionProbe(page),
  };
}

export async function checkSessionStatus(
  command: SessionStatusCommand,
  dependencies: SessionStatusDependencies = createDefaultSessionStatusDependencies(),
): Promise<SessionStatusResult> {
  const paths = dependencies.pathResolver.resolve('chatgpt', command.profileId);
  const lease = await dependencies.profileLock.acquire(paths.lockFile);
  let context: Awaited<ReturnType<BrowserPort['launchPersistentContext']>> | undefined;

  try {
    context = await dependencies.browser.launchPersistentContext({
      profilePath: paths.profileDir,
      headless: command.headless ?? false,
    });
    const page = await context.firstPage();

    try {
      await page.goto(CHATGPT_URL);
    } catch (error) {
      throw new WebAutomationError('NAVIGATION_FAILED', 'Failed to open ChatGPT for session check', {
        cause: error,
      });
    }

    const status = await new SessionManager(dependencies.createProbe(page)).check();
    return { profileId: command.profileId, status };
  } finally {
    try {
      await context?.close();
    } finally {
      await lease.release();
    }
  }
}
