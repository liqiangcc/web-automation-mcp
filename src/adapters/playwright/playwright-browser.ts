import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';
import type { Browser, BrowserContext, Locator, Page } from 'playwright';

import type {
  BrowserContextPort,
  BrowserElementSnapshot,
  BrowserPagePort,
  BrowserPort,
  DomChangeWaitOptions,
  DomChangeWaitResult,
  LocatorCandidate,
  PersistentBrowserOptions,
} from '../../ports/browser-port.js';

export class PlaywrightBrowserAdapter implements BrowserPort {
  public constructor(
    private readonly cdpUrl = process.env.WEB_AUTOMATION_MCP_CDP_URL?.trim() || undefined,
  ) {}

  public async launchPersistentContext(
    options: PersistentBrowserOptions,
  ): Promise<BrowserContextPort> {
    if (this.cdpUrl !== undefined) {
      return this.connectOverCdp(this.cdpUrl);
    }

    await mkdir(options.profilePath, { recursive: true });

    const context = await chromium.launchPersistentContext(options.profilePath, {
      headless: options.headless,
    });

    return new PlaywrightBrowserContext(context, async () => context.close());
  }

  private async connectOverCdp(cdpUrl: string): Promise<BrowserContextPort> {
    const browser = await chromium.connectOverCDP(cdpUrl);
    const context = browser.contexts()[0];
    if (context === undefined) {
      await browser.close();
      throw new Error(`Chrome at ${cdpUrl} does not expose a default browser context`);
    }

    return new PlaywrightBrowserContext(
      context,
      async (page) => {
        await page?.close().catch(() => undefined);
        await disconnectFromBrowser(browser);
      },
      true,
    );
  }
}

class PlaywrightBrowserContext implements BrowserContextPort {
  private page: Page | undefined;

  public constructor(
    private readonly context: BrowserContext,
    private readonly closeContext: (page?: Page) => Promise<void>,
    private readonly createIsolatedPage = false,
  ) {}

  public async firstPage(): Promise<BrowserPagePort> {
    this.page = this.createIsolatedPage
      ? await this.context.newPage()
      : (this.context.pages()[0] ?? (await this.context.newPage()));
    return new PlaywrightBrowserPage(this.page);
  }

  public async close(): Promise<void> {
    await this.closeContext(this.page);
  }
}

async function disconnectFromBrowser(browser: Browser): Promise<void> {
  await browser.close();
}

class PlaywrightBrowserPage implements BrowserPagePort {
  public constructor(private readonly page: Page) {}

  public async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  public currentUrl(): string {
    return this.page.url();
  }

  public async isVisible(candidate: LocatorCandidate): Promise<boolean> {
    return (await this.visibleLocator(candidate).count()) > 0;
  }

  public async exists(candidate: LocatorCandidate): Promise<boolean> {
    return (await this.locator(candidate).count()) > 0;
  }

  public async isEditable(candidate: LocatorCandidate): Promise<boolean> {
    const locator = this.visibleLocator(candidate);
    return (await locator.count()) > 0 && locator.first().isEditable();
  }

  public async waitForDomChange(options: DomChangeWaitOptions): Promise<DomChangeWaitResult> {
    const timeoutMs = Math.max(1, options.timeoutMs);
    const debounceMs = Math.max(0, options.debounceMs ?? 75);

    return this.page.evaluate(
      ({ timeoutMs: pageTimeoutMs, debounceMs: pageDebounceMs }) =>
        new Promise<'changed' | 'timeout'>((resolve) => {
          const root = document.documentElement;
          if (root === null) {
            resolve('timeout');
            return;
          }

          let completed = false;
          const timers: { debounce?: number; timeout?: number } = {};

          const finish = (result: 'changed' | 'timeout'): void => {
            if (completed) {
              return;
            }
            completed = true;
            observer.disconnect();
            if (timers.debounce !== undefined) {
              window.clearTimeout(timers.debounce);
            }
            if (timers.timeout !== undefined) {
              window.clearTimeout(timers.timeout);
            }
            resolve(result);
          };

          const observer = new MutationObserver(() => {
            if (timers.debounce !== undefined) {
              return;
            }
            timers.debounce = window.setTimeout(() => finish('changed'), pageDebounceMs);
          });

          observer.observe(root, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
          });
          timers.timeout = window.setTimeout(() => finish('timeout'), pageTimeoutMs);
        }),
      { timeoutMs, debounceMs },
    );
  }

  public async elementSnapshots(
    candidate: LocatorCandidate,
    attributeNames: readonly string[],
  ): Promise<readonly BrowserElementSnapshot[]> {
    return this.locator(candidate).evaluateAll(
      (elements, names) =>
        elements.map((element) => ({
          text: element.textContent ?? '',
          attributes: Object.fromEntries(names.map((name) => [name, element.getAttribute(name)])),
        })),
      [...attributeNames],
    );
  }

  public async scrollIntoView(candidate: LocatorCandidate, index: number): Promise<void> {
    const locator = this.locator(candidate);
    const count = await locator.count();
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new RangeError(`Locator index ${index} is outside the current element range.`);
    }
    await locator.nth(index).scrollIntoViewIfNeeded();
  }

  public async hover(candidate: LocatorCandidate): Promise<void> {
    await this.visibleLocator(candidate).first().hover();
  }

  public async fill(candidate: LocatorCandidate, value: string): Promise<void> {
    await this.visibleLocator(candidate).first().fill(value);
  }

  public async click(candidate: LocatorCandidate): Promise<void> {
    await this.visibleLocator(candidate).first().click();
  }

  public async press(candidate: LocatorCandidate, key: string): Promise<void> {
    await this.visibleLocator(candidate).first().press(key);
  }

  public async setInputFiles(
    candidate: LocatorCandidate,
    filePaths: readonly string[],
  ): Promise<void> {
    await this.locator(candidate).first().setInputFiles([...filePaths]);
  }

  public async textContents(candidate: LocatorCandidate): Promise<readonly string[]> {
    return this.locator(candidate).allTextContents();
  }

  private locator(candidate: LocatorCandidate): Locator {
    switch (candidate.kind) {
      case 'role': {
        const role = candidate.role as Parameters<Page['getByRole']>[0];
        return this.page.getByRole(
          role,
          candidate.name === undefined ? undefined : { name: candidate.name },
        );
      }
      case 'label':
        return this.page.getByLabel(candidate.text);
      case 'placeholder':
        return this.page.getByPlaceholder(candidate.text);
      case 'testId':
        return this.page.getByTestId(candidate.value);
      case 'css':
        return this.page.locator(candidate.value);
    }
  }

  private visibleLocator(candidate: LocatorCandidate): Locator {
    return this.locator(candidate).filter({ visible: true });
  }
}
