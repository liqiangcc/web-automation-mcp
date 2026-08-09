import { describe, expect, it, vi } from 'vitest';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';

import { PlaywrightBrowserAdapter } from '../../../src/adapters/playwright/playwright-browser.js';

describe('PlaywrightBrowserAdapter CDP mode', () => {
  it('uses a new page in the shared context and disconnects without closing host Chrome', async () => {
    const page = { close: vi.fn(async () => undefined) } as unknown as Page;
    const browserContext = {
      newPage: vi.fn(async () => page),
      pages: vi.fn(() => []),
      close: vi.fn(async () => undefined),
    } as unknown as BrowserContext;
    const browser = {
      contexts: vi.fn(() => [browserContext]),
      close: vi.fn(async () => undefined),
    } as unknown as Browser;
    const connect = vi.spyOn(chromium, 'connectOverCDP').mockResolvedValue(browser);

    const context = await new PlaywrightBrowserAdapter(
      'http://127.0.0.1:9223',
    ).launchPersistentContext({
      profilePath: '/unused/in/cdp-mode',
      headless: true,
    });
    await context.firstPage();
    await context.close();

    expect(connect).toHaveBeenCalledWith('http://127.0.0.1:9223');
    expect(browserContext.newPage).toHaveBeenCalledOnce();
    expect(page.close).toHaveBeenCalledOnce();
    expect(browser.close).toHaveBeenCalledOnce();
    expect(browserContext.close).not.toHaveBeenCalled();
  });
});
