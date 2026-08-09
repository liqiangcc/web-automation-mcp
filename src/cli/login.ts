import { ChatGptSessionProbe } from '../adapters/chatgpt/session-probe.js';
import { CHATGPT_URL } from '../adapters/chatgpt/chatgpt-config.js';
import { PlaywrightBrowserAdapter } from '../adapters/playwright/playwright-browser.js';
import { WebAutomationError } from '../domain/errors.js';
import type { BrowserPagePort, BrowserPort } from '../ports/browser-port.js';
import type { SessionProbe, SessionStatus } from '../ports/session-probe.js';
import { ProfileLock } from '../session/profile-lock.js';
import { ProfilePathResolver } from '../session/profile-path.js';
import { SessionManager } from '../session/session-manager.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

export interface LoginCommand {
  readonly profileId: string;
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export interface LoginResult {
  readonly profileId: string;
  readonly status: 'AUTHENTICATED';
  readonly message: string;
}

export interface LoginDependencies {
  readonly browser: BrowserPort;
  readonly pathResolver: Pick<ProfilePathResolver, 'resolve'>;
  readonly profileLock: Pick<ProfileLock, 'acquire'>;
  readonly createProbe: (page: BrowserPagePort) => SessionProbe;
  readonly now: () => number;
  readonly sleep: (delayMs: number) => Promise<void>;
  readonly onStatus: (status: SessionStatus) => void;
}

export function createDefaultLoginDependencies(
  onStatus: (status: SessionStatus) => void = () => undefined,
): LoginDependencies {
  return {
    browser: new PlaywrightBrowserAdapter(),
    pathResolver: new ProfilePathResolver(),
    profileLock: new ProfileLock(),
    createProbe: (page) => new ChatGptSessionProbe(page),
    now: Date.now,
    sleep: (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    onStatus,
  };
}

export async function login(
  command: LoginCommand,
  dependencies: LoginDependencies = createDefaultLoginDependencies(),
): Promise<LoginResult> {
  const timeoutMs = command.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = command.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  assertPositiveDuration('timeoutMs', timeoutMs);
  assertPositiveDuration('pollIntervalMs', pollIntervalMs);

  const paths = dependencies.pathResolver.resolve('chatgpt', command.profileId);
  const lease = await dependencies.profileLock.acquire(paths.lockFile);
  let context: Awaited<ReturnType<BrowserPort['launchPersistentContext']>> | undefined;

  try {
    context = await dependencies.browser.launchPersistentContext({
      profilePath: paths.profileDir,
      headless: false,
    });
    const page = await context.firstPage();

    try {
      await page.goto(CHATGPT_URL);
    } catch (error) {
      throw new WebAutomationError('NAVIGATION_FAILED', 'Failed to open ChatGPT login page', {
        cause: error,
      });
    }

    const manager = new SessionManager(dependencies.createProbe(page));
    const status = await manager.waitForAuthenticated({
      timeoutMs,
      pollIntervalMs,
      now: dependencies.now,
      sleep: dependencies.sleep,
      onStatus: dependencies.onStatus,
    });

    if (status === 'AUTHENTICATED') {
      return {
        profileId: command.profileId,
        status,
        message: 'ChatGPT authentication confirmed and persistent profile saved.',
      };
    }

    if (status === 'AUTH_REQUIRED') {
      throw new WebAutomationError(
        'AUTH_REQUIRED',
        `ChatGPT login was not completed within ${timeoutMs} ms`,
      );
    }

    throw new WebAutomationError(
      'PROVIDER_UNAVAILABLE',
      'Could not determine ChatGPT authentication state before the login timeout',
    );
  } finally {
    try {
      await context?.close();
    } finally {
      await lease.release();
    }
  }
}

function assertPositiveDuration(field: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${field} must be a positive finite number`);
  }
}
