import { describe, expect, it } from 'vitest';

import { login } from '../../src/cli/login.js';
import type {
  BrowserContextPort,
  BrowserPagePort,
  BrowserPort,
  PersistentBrowserOptions,
} from '../../src/ports/browser-port.js';
import type { SessionProbe, SessionStatus } from '../../src/ports/session-probe.js';

describe('login', () => {
  it('opens a headed persistent profile, waits for authentication, then closes and releases', async () => {
    const page = new FakePage();
    const context = new FakeContext(page);
    const browser = new FakeBrowser(context);
    const probe = new SequenceProbe(['AUTH_REQUIRED', 'AUTHENTICATED']);
    let released = false;
    let clock = 0;
    const statuses: SessionStatus[] = [];

    const result = await login(
      { profileId: 'default', timeoutMs: 5_000, pollIntervalMs: 100 },
      {
        browser,
        pathResolver: {
          resolve: () => ({
            rootDir: '/tmp/web-automation-mcp',
            profileDir: '/tmp/web-automation-mcp/profiles/chatgpt/default',
            lockFile: '/tmp/web-automation-mcp/locks/chatgpt--default.lock',
          }),
        },
        profileLock: {
          acquire: async () => ({
            lockFile: '/tmp/web-automation-mcp/locks/chatgpt--default.lock',
            release: async () => {
              released = true;
            },
          }),
        },
        createProbe: () => probe,
        now: () => clock,
        sleep: async (delayMs) => {
          clock += delayMs;
        },
        onStatus: (status) => statuses.push(status),
      },
    );

    expect(result.status).toBe('AUTHENTICATED');
    expect(browser.options).toEqual({
      profilePath: '/tmp/web-automation-mcp/profiles/chatgpt/default',
      headless: false,
    });
    expect(page.visitedUrl).toBe('https://chatgpt.com/');
    expect(statuses).toEqual(['AUTH_REQUIRED', 'AUTHENTICATED']);
    expect(context.closed).toBe(true);
    expect(released).toBe(true);
  });

  it('closes and releases the profile when navigation fails', async () => {
    const page = new FakePage();
    page.navigationError = new Error('offline');
    const context = new FakeContext(page);
    let released = false;

    await expect(
      login(
        { profileId: 'default' },
        {
          browser: new FakeBrowser(context),
          pathResolver: {
            resolve: () => ({
              rootDir: '/tmp/root',
              profileDir: '/tmp/root/profile',
              lockFile: '/tmp/root/lock',
            }),
          },
          profileLock: {
            acquire: async () => ({
              lockFile: '/tmp/root/lock',
              release: async () => {
                released = true;
              },
            }),
          },
          createProbe: () => new SequenceProbe(['UNKNOWN']),
          now: () => 0,
          sleep: async () => undefined,
          onStatus: () => undefined,
        },
      ),
    ).rejects.toMatchObject({ code: 'NAVIGATION_FAILED' });

    expect(context.closed).toBe(true);
    expect(released).toBe(true);
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
  public navigationError: Error | undefined;

  public async goto(url: string): Promise<void> {
    this.visitedUrl = url;
    if (this.navigationError !== undefined) {
      throw this.navigationError;
    }
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

class SequenceProbe implements SessionProbe {
  private index = 0;

  public constructor(private readonly statuses: readonly SessionStatus[]) {}

  public async check(): Promise<SessionStatus> {
    const status = this.statuses[Math.min(this.index, this.statuses.length - 1)] ?? 'UNKNOWN';
    this.index += 1;
    return status;
  }
}
