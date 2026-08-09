import { describe, expect, it } from 'vitest';

import { BrowserSessionManager } from '../../src/session/browser-session.js';
import type {
  BrowserContextPort,
  BrowserPagePort,
  BrowserPort,
  PersistentBrowserOptions,
} from '../../src/ports/browser-port.js';

describe('BrowserSessionManager', () => {
  it('holds a profile lease until the browser session closes', async () => {
    const page = fakePage();
    const context = new FakeContext(page);
    const browser = new FakeBrowser(context);
    let released = false;

    const manager = new BrowserSessionManager(
      browser,
      {
        resolve: () => ({
          rootDir: '/tmp/root',
          profileDir: '/tmp/root/profiles/chatgpt/default',
          lockFile: '/tmp/root/locks/chatgpt--default.lock',
        }),
      },
      {
        acquire: async () => ({
          lockFile: '/tmp/root/locks/chatgpt--default.lock',
          release: async () => {
            released = true;
          },
        }),
      },
      { headless: true },
    );

    const session = await manager.acquire('chatgpt', 'default');
    expect(browser.options).toEqual({
      profilePath: '/tmp/root/profiles/chatgpt/default',
      headless: true,
    });
    expect(released).toBe(false);

    await session.close();
    expect(context.closed).toBe(true);
    expect(released).toBe(true);
  });

  it('releases the profile when browser launch fails', async () => {
    let released = false;
    const manager = new BrowserSessionManager(
      {
        launchPersistentContext: async () => {
          throw new Error('launch failed');
        },
      },
      {
        resolve: () => ({ rootDir: '/tmp/root', profileDir: '/tmp/profile', lockFile: '/tmp/lock' }),
      },
      {
        acquire: async () => ({
          lockFile: '/tmp/lock',
          release: async () => {
            released = true;
          },
        }),
      },
    );

    await expect(manager.acquire('chatgpt', 'default')).rejects.toThrow('launch failed');
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

function fakePage(): BrowserPagePort {
  return {
    goto: async () => undefined,
    isVisible: async () => false,
    fill: async () => undefined,
    click: async () => undefined,
    press: async () => undefined,
    textContents: async () => [],
  };
}
