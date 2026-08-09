import type { ProviderId, ProfileId } from '../domain/conversation.js';
import type { BrowserContextPort, BrowserPort } from '../ports/browser-port.js';
import type { BrowserSession, BrowserSessionPort } from '../ports/browser-session-port.js';
import { ProfileLock, type ProfileLease } from './profile-lock.js';
import { ProfilePathResolver } from './profile-path.js';

export interface BrowserSessionManagerOptions {
  readonly headless?: boolean;
}

export class BrowserSessionManager implements BrowserSessionPort {
  private readonly headless: boolean;

  public constructor(
    private readonly browser: BrowserPort,
    private readonly pathResolver: Pick<ProfilePathResolver, 'resolve'> = new ProfilePathResolver(),
    private readonly profileLock: Pick<ProfileLock, 'acquire'> = new ProfileLock(),
    options: BrowserSessionManagerOptions = {},
  ) {
    this.headless = options.headless ?? true;
  }

  public async acquire(provider: ProviderId, profileId: ProfileId): Promise<BrowserSession> {
    const paths = this.pathResolver.resolve(provider, profileId);
    const lease = await this.profileLock.acquire(paths.lockFile);
    let context: BrowserContextPort | undefined;

    try {
      context = await this.browser.launchPersistentContext({
        profilePath: paths.profileDir,
        headless: this.headless,
      });
      const page = await context.firstPage();
      return new ManagedBrowserSession(page, context, lease);
    } catch (error) {
      try {
        await context?.close();
      } finally {
        await lease.release();
      }
      throw error;
    }
  }
}

class ManagedBrowserSession implements BrowserSession {
  private closed = false;

  public constructor(
    public readonly page: BrowserSession['page'],
    private readonly context: BrowserContextPort,
    private readonly lease: ProfileLease,
  ) {}

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    try {
      await this.context.close();
    } finally {
      await this.lease.release();
    }
  }
}
