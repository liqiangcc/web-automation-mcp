import { describe, expect, it } from 'vitest';

import { ChatGptConversationMutation } from '../../../src/adapters/chatgpt/conversation-mutation.js';
import { WebAutomationError } from '../../../src/domain/errors.js';
import type {
  BrowserElementSnapshot,
  BrowserPagePort,
  DomChangeWaitResult,
  LocatorCandidate,
} from '../../../src/ports/browser-port.js';

class FakeDeletionPage implements BrowserPagePort {
  public current = 'https://chatgpt.com/c/target';
  public deleted = false;
  public menuOpened = false;
  public deleteActionOpened = false;
  public clicked: LocatorCandidate[] = [];
  public hovered: LocatorCandidate[] = [];

  public constructor(
    private readonly includeTarget = true,
    private readonly confirmDeletion = true,
  ) {}

  public async goto(): Promise<void> {}

  public currentUrl(): string {
    return this.current;
  }

  public async isVisible(locator: LocatorCandidate): Promise<boolean> {
    if (locator.kind === 'css' && locator.value === 'a[href^="/c/"]') {
      return true;
    }
    if (locator.kind === 'css' && locator.value.includes('a[href="/c/target"]')) {
      return this.includeTarget && !this.deleted;
    }
    if (locator.kind === 'role' && locator.role === 'menuitem' && locator.name === 'Delete') {
      return this.menuOpened;
    }
    if (locator.kind === 'role' && locator.role === 'button' && locator.name === 'Delete') {
      return this.deleteActionOpened;
    }
    return false;
  }

  public async exists(locator: LocatorCandidate): Promise<boolean> {
    if (locator.kind === 'css' && locator.value === 'a[href^="/c/"]') {
      return true;
    }
    if (locator.kind === 'css' && locator.value === 'a[href="/c/target"]') {
      return this.includeTarget && !this.deleted;
    }
    return this.isVisible(locator);
  }

  public async elementSnapshots(): Promise<readonly BrowserElementSnapshot[]> {
    const snapshots: BrowserElementSnapshot[] = [
      { text: 'Duplicate title', attributes: { href: '/c/other' } },
    ];
    if (this.includeTarget && !this.deleted) {
      snapshots.push({ text: 'Duplicate title', attributes: { href: '/c/target' } });
    }
    return snapshots;
  }

  public async scrollIntoView(): Promise<void> {}

  public async hover(locator: LocatorCandidate): Promise<void> {
    this.hovered.push(locator);
  }

  public async waitForDomChange(): Promise<DomChangeWaitResult> {
    return 'timeout';
  }

  public async fill(): Promise<void> {}

  public async click(locator: LocatorCandidate): Promise<void> {
    this.clicked.push(locator);
    if (locator.kind === 'css' && locator.value.includes('a[href="/c/target"]')) {
      this.menuOpened = true;
      return;
    }
    if (locator.kind === 'role' && locator.role === 'menuitem' && locator.name === 'Delete') {
      this.deleteActionOpened = true;
      return;
    }
    if (locator.kind === 'role' && locator.role === 'button' && locator.name === 'Delete') {
      if (this.confirmDeletion) {
        this.deleted = true;
        this.current = 'https://chatgpt.com/';
      }
    }
  }

  public async press(): Promise<void> {}

  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}

describe('ChatGptConversationMutation', () => {
  it('scopes destructive interaction to the exact conversation id even with duplicate titles', async () => {
    const page = new FakeDeletionPage();

    await new ChatGptConversationMutation(page).delete('target');

    expect(page.deleted).toBe(true);
    expect(page.hovered).toEqual([{ kind: 'css', value: 'a[href="/c/target"]' }]);
    const menuClick = page.clicked.find(
      (candidate) => candidate.kind === 'css' && candidate.value.includes('aria-haspopup'),
    );
    expect(menuClick).toBeDefined();
    expect(menuClick?.kind === 'css' ? menuClick.value : '').toContain('/c/target');
    expect(menuClick?.kind === 'css' ? menuClick.value : '').not.toContain('/c/other');
  });

  it('does not perform a destructive click when the requested id is absent', async () => {
    const page = new FakeDeletionPage(false);

    let caught: unknown;
    try {
      await new ChatGptConversationMutation(page).delete('target');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WebAutomationError);
    expect((caught as WebAutomationError).code).toBe('CONVERSATION_NOT_FOUND');
    expect(page.clicked).toEqual([]);
  });

  it('fails closed when post-delete disappearance cannot be positively confirmed', async () => {
    const page = new FakeDeletionPage(true, false);

    let caught: unknown;
    try {
      await new ChatGptConversationMutation(page).delete('target');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(WebAutomationError);
    expect((caught as WebAutomationError).code).toBe('CONVERSATION_DELETE_NOT_CONFIRMED');
  });
});
