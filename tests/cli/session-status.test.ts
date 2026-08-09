import { describe, expect, it } from 'vitest';

import { checkSessionStatus } from '../../src/cli/session-status.js';
import type {
  BrowserContextPort,
  BrowserPagePort,
  BrowserPort,
  PersistentBrowserOptions,
} from '../../src/ports/browser-port.js';
import type { SessionProbe, SessionStatus } from '../../src/ports/session-probe.js';

describe('checkSessionStatus', () => {
  it('checks the persistent profile and always closes/releases resources', async () => {
    const page = new FakePage();
    const context = new FakeContext(page);
    const browser = new FakeBrowser(context);
    let released = false;

    const result = await checkSessionStatus(
      { profileId: 'default' },
      {
        browser,
        pathResolver: {
          resolve: () => ({
            rootDir: '/tmp/root',
            profileDir: '/tmp/root/profiles/chatgpt/default',
            lockFile: '/tmp/root/locks/chatgpt--default.lock',
          }),
        },
        profileLock: {
          acquire: async () => ({
            lockFile: '/tmp/root/locks/chatgpt--default.lock',
            release: async () => {
              released = true;
            },
          }),
        },
        createProbe: () => new FixedProbe('AUTHENTICATED'),
      },
    );

    expect(result).toEqual({ profileId: 'default', status: 'AUTHENTICATED' });
    expect(browser.options).toEqual({
      profilePath: '/tmp/root/profiles/chatgpt/default',
      headless: false,
    });
    expect(page.visitedUrl).toBe('https://chatgpt.com/');
    expect(context.closed).toBe(true);
    expect(released).toBe(true);
  });

  it('returns explicit AUTH_REQUIRED without polling for the full stabilization timeout', async () => {
    const page = new FakePage();
    const context = new FakeContext(page);
    const probe = new CountingProbe('AUTH_REQUIRED');

    const result = await checkSessionStatus(
      { profileId: 'default', timeoutMs: 60_000, pollIntervalMs: 250 },
      {
        browser: new FakeBrowser(context),
        pathResolver: {
          resolve: () => ({
            rootDir: '/tmp/root',
            profileDir: '/tmp/root/profiles/chatgpt/default',
            lockFile: '/tmp/root/locks/chatgpt--default.lock',
          }),
        },
        profileLock: {
          acquire: async () => ({
            lockFile: '/tmp/root/locks/chatgpt--default.lock',
            release: async () => undefined,
          }),
        },
        createProbe: () => probe,
      },
    );

    expect(result).toEqual({ profileId: 'default', status: 'AUTH_REQUIRED' });
    expect(probe.checks).toBe(1);
    expect(context.closed).toBe(true);
  });
});

class FakeBrowser implements BrowserPort {
  public options: PersistentBrowserOptions | undefined;

  public constructor(private readonly context: BrowserContextPort) {}

  public async launchPersistentContext(options: PersistentBrowserOptions): Promise<BrowserContextPort> {
    this.options = options;
    return this.context;
  }
}

class FakeContext implements BrowserContextPort {
  public closed = false;

  public constructor(private readonly page: BrowserPagePort) {}

  public async firstPage(): Promise<BrowserPagePort> {
    return this.page;
  }

  public async close(): Promise<void> {
    this.closed = true;
  }
}

class FakePage implements BrowserPagePort {
  public visitedUrl: string | undefined;

  public async goto(url: string): Promise<void> {
    this.visitedUrl = url;
  }

  public async isVisible(): Promise<boolean> {
    return false;
  }

  public async fill(): Promise<void> {}

  public async click(): Promise<void> {}

  public async press(): Promise<void> {}

  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}

class FixedProbe implements SessionProbe {
  public constructor(private readonly status: SessionStatus) {}

  public async check(): Promise<SessionStatus> {
    return this.status;
  }
}

class CountingProbe implements SessionProbe {
  public checks = 0;

  public constructor(private readonly status: SessionStatus) {}

  public async check(): Promise<SessionStatus> {
    this.checks += 1;
    return this.status;
  }
}
