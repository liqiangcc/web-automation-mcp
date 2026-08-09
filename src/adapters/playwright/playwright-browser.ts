import { mkdir } from 'node:fs/promises';

import { chromium } from 'playwright';
import type { BrowserContext, Locator, Page } from 'playwright';

import type {
  BrowserContextPort,
  BrowserPagePort,
  BrowserPort,
  LocatorCandidate,
  PersistentBrowserOptions,
} from '../../ports/browser-port.js';

export class PlaywrightBrowserAdapter implements BrowserPort {
  public async launchPersistentContext(options: PersistentBrowserOptions): Promise<BrowserContextPort> {
    await mkdir(options.profilePath, { recursive: true });

    const context = await chromium.launchPersistentContext(options.profilePath, {
      headless: options.headless,
    });

    return new PlaywrightBrowserContext(context);
  }
}

class PlaywrightBrowserContext implements BrowserContextPort {
  public constructor(private readonly context: BrowserContext) {}

  public async firstPage(): Promise<BrowserPagePort> {
    const page = this.context.pages()[0] ?? (await this.context.newPage());
    return new PlaywrightBrowserPage(page);
  }

  public async close(): Promise<void> {
    await this.context.close();
  }
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
    return this.locator(candidate).first().isVisible();
  }

  public async fill(candidate: LocatorCandidate, value: string): Promise<void> {
    await this.locator(candidate).first().fill(value);
  }

  public async click(candidate: LocatorCandidate): Promise<void> {
    await this.locator(candidate).first().click();
  }

  public async press(candidate: LocatorCandidate, key: string): Promise<void> {
    await this.locator(candidate).first().press(key);
  }

  public async textContents(candidate: LocatorCandidate): Promise<readonly string[]> {
    return this.locator(candidate).allTextContents();
  }

  private locator(candidate: LocatorCandidate): Locator {
    switch (candidate.kind) {
      case 'role': {
        const role = candidate.role as Parameters<Page['getByRole']>[0];
        return this.page.getByRole(role, candidate.name === undefined ? undefined : { name: candidate.name });
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
}
