import type { ConversationId } from '../../domain/conversation.js';
import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort, LocatorCandidate } from '../../ports/browser-port.js';
import { ChatGptConversationNavigator } from './conversation-navigator.js';
import { ChatGptTargetResolver } from './target-resolver.js';

const DOM_WAIT_MS = 1_000;
const MAX_DISCOVERY_STALLED_ROUNDS = 3;
const MAX_CONFIRMATION_ROUNDS = 5;

export class ChatGptConversationMutation {
  public constructor(private readonly page: BrowserPagePort) {}

  public async delete(conversationId: ConversationId): Promise<void> {
    const exists = this.page.exists;
    const elementSnapshots = this.page.elementSnapshots;
    const scrollIntoView = this.page.scrollIntoView;
    const hover = this.page.hover;
    const waitForDomChange = this.page.waitForDomChange;
    if (
      exists === undefined ||
      elementSnapshots === undefined ||
      scrollIntoView === undefined ||
      hover === undefined ||
      waitForDomChange === undefined
    ) {
      throw new WebAutomationError(
        'PROVIDER_CHANGED',
        'Browser adapter does not expose the generic mechanics required for safe conversation deletion.',
      );
    }

    const navigator = new ChatGptConversationNavigator(this.page);
    await navigator.open(conversationId);
    if (navigator.currentConversationId() !== conversationId) {
      throw new WebAutomationError(
        'CONVERSATION_NOT_FOUND',
        'The requested conversation could not be positively identified before deletion.',
      );
    }

    const exactHandle = exactConversationHandle(conversationId);
    const found = await findExactHandle(
      this.page,
      conversationId,
      elementSnapshots,
      scrollIntoView,
      waitForDomChange,
    );
    if (!found || !(await exists.call(this.page, exactHandle))) {
      throw new WebAutomationError(
        'CONVERSATION_NOT_FOUND',
        'The requested conversation is not present in the provider conversation history.',
      );
    }

    try {
      await hover.call(this.page, exactHandle);
      await clickExactRowMenu(this.page, conversationId);
      const resolver = new ChatGptTargetResolver(this.page);
      await this.page.click(await resolver.require('conversation-delete-action'));
      await this.page.click(await resolver.require('conversation-delete-confirm'));
    } catch (error) {
      if (error instanceof WebAutomationError && error.code === 'TARGET_NOT_FOUND') {
        throw new WebAutomationError(
          'CONVERSATION_DELETE_FAILED',
          'The provider deletion controls could not be resolved safely.',
          { cause: error },
        );
      }
      throw new WebAutomationError(
        'CONVERSATION_DELETE_FAILED',
        'The provider deletion interaction failed before success could be confirmed.',
        { cause: error },
      );
    }

    for (let round = 0; round < MAX_CONFIRMATION_ROUNDS; round += 1) {
      const handleGone = !(await exists.call(this.page, exactHandle));
      const activeTargetGone = currentConversationId(this.page) !== conversationId;
      if (handleGone && activeTargetGone) {
        return;
      }
      await waitForDomChange.call(this.page, { timeoutMs: DOM_WAIT_MS, debounceMs: 75 });
    }

    throw new WebAutomationError(
      'CONVERSATION_DELETE_NOT_CONFIRMED',
      'The deletion action was submitted, but the requested conversation disappearance could not be positively confirmed.',
    );
  }
}

async function findExactHandle(
  page: BrowserPagePort,
  conversationId: ConversationId,
  elementSnapshots: NonNullable<BrowserPagePort['elementSnapshots']>,
  scrollIntoView: NonNullable<BrowserPagePort['scrollIntoView']>,
  waitForDomChange: NonNullable<BrowserPagePort['waitForDomChange']>,
): Promise<boolean> {
  const locator = await new ChatGptTargetResolver(page).findExisting('conversation-link');
  if (locator === undefined) {
    return false;
  }

  let stalledRounds = 0;
  const seen = new Set<string>();
  while (stalledRounds < MAX_DISCOVERY_STALLED_ROUNDS) {
    const snapshots = await elementSnapshots.call(page, locator, ['href']);
    let semanticProgress = false;

    for (const snapshot of snapshots) {
      const id = parseConversationId(snapshot.attributes.href);
      if (id === conversationId) {
        return true;
      }
      if (id !== undefined && !seen.has(id)) {
        seen.add(id);
        semanticProgress = true;
      }
    }

    stalledRounds = semanticProgress ? 0 : stalledRounds + 1;
    if (snapshots.length === 0 || stalledRounds >= MAX_DISCOVERY_STALLED_ROUNDS) {
      return false;
    }

    try {
      await scrollIntoView.call(page, locator, snapshots.length - 1);
    } catch {
      // Virtualized rows may be replaced between the snapshot and scroll.
    }
    await waitForDomChange.call(page, { timeoutMs: DOM_WAIT_MS, debounceMs: 75 });
  }

  return false;
}

async function clickExactRowMenu(page: BrowserPagePort, conversationId: ConversationId): Promise<void> {
  for (const candidate of exactRowMenuCandidates(conversationId)) {
    try {
      if (await page.isVisible(candidate)) {
        await page.click(candidate);
        return;
      }
    } catch {
      // Try the next provider-specific fallback, all scoped to the exact ID.
    }
  }

  throw new WebAutomationError(
    'TARGET_NOT_FOUND',
    'Could not resolve the action menu for the requested conversation.',
  );
}

function exactConversationHandle(conversationId: ConversationId): LocatorCandidate {
  return { kind: 'css', value: `a[href="/c/${escapeCssAttribute(conversationId)}"]` };
}

function exactRowMenuCandidates(conversationId: ConversationId): readonly LocatorCandidate[] {
  const href = `/c/${escapeCssAttribute(conversationId)}`;
  return [
    {
      kind: 'css',
      value: `div:has(a[href="${href}"]) button[aria-haspopup="menu"]`,
    },
    {
      kind: 'css',
      value: `div:has(a[href="${href}"]) button[aria-label*="conversation" i]`,
    },
    {
      kind: 'css',
      value: `div:has(a[href="${href}"]) button[aria-label*="options" i]`,
    },
  ];
}

function escapeCssAttribute(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function parseConversationId(href: string | null | undefined): string | undefined {
  if (href === null || href === undefined) {
    return undefined;
  }
  const match = /^\/c\/([^/?#]+)/.exec(href);
  if (match?.[1] === undefined) {
    return undefined;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function currentConversationId(page: BrowserPagePort): string | undefined {
  const currentUrl = page.currentUrl?.();
  if (currentUrl === undefined) {
    return undefined;
  }
  try {
    const match = /^\/c\/([^/]+)\/?$/.exec(new URL(currentUrl).pathname);
    return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}
