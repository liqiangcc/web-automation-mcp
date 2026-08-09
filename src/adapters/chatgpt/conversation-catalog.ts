import { Buffer } from 'node:buffer';

import type {
  ConversationCursor,
  ConversationPage,
  ConversationSummary,
} from '../../domain/conversation.js';
import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort, LocatorCandidate } from '../../ports/browser-port.js';
import type { ConversationCatalogInput } from '../../ports/conversation-catalog-port.js';
import { ChatGptPageHealthProbe, type ChatGptPageHealth } from './page-health.js';
import { ChatGptTargetResolver } from './target-resolver.js';

const MAX_STALLED_ROUNDS = 3;
const DOM_WAIT_MS = 1_000;
const CURSOR_VERSION = 1;

interface ConversationCursorPayload {
  readonly version: 1;
  readonly afterConversationId: string;
}

export class ChatGptConversationCatalog {
  public constructor(private readonly page: BrowserPagePort) {}

  public async list(input: ConversationCatalogInput): Promise<ConversationPage> {
    const elementSnapshots = this.page.elementSnapshots;
    const scrollIntoView = this.page.scrollIntoView;
    if (elementSnapshots === undefined || scrollIntoView === undefined) {
      throw new WebAutomationError(
        'PROVIDER_CHANGED',
        'Browser adapter does not expose the generic mechanics required for conversation discovery.',
      );
    }

    const locator = await this.requireConversationLocator();
    const afterConversationId = decodeCursor(input.cursor);
    const seen = new Set<string>();
    const conversations: ConversationSummary[] = [];
    let cursorReached = afterConversationId === undefined;
    let stalledRounds = 0;

    while (stalledRounds < MAX_STALLED_ROUNDS) {
      const snapshots = await elementSnapshots.call(this.page, locator, ['href']);
      let semanticProgress = false;

      for (const snapshot of snapshots) {
        const conversationId = parseConversationId(snapshot.attributes.href);
        if (conversationId === undefined || seen.has(conversationId)) {
          continue;
        }

        seen.add(conversationId);
        semanticProgress = true;

        if (!cursorReached) {
          if (conversationId === afterConversationId) {
            cursorReached = true;
          }
          continue;
        }

        if (conversationId === afterConversationId) {
          continue;
        }

        conversations.push({
          conversationId,
          title: snapshot.text.trim(),
        });

        if (conversations.length > input.limit) {
          const pageItems = conversations.slice(0, input.limit);
          const last = pageItems[pageItems.length - 1];
          if (last === undefined) {
            throw new WebAutomationError(
              'PROVIDER_CHANGED',
              'Conversation pagination produced an invalid provider state.',
            );
          }
          return {
            conversations: pageItems,
            nextCursor: encodeCursor(last.conversationId),
          };
        }
      }

      stalledRounds = semanticProgress ? 0 : stalledRounds + 1;
      if (stalledRounds >= MAX_STALLED_ROUNDS) {
        break;
      }

      if (snapshots.length > 0) {
        await tryScrollToLast(this.page, locator, snapshots.length - 1);
      }

      const waitForDomChange = this.page.waitForDomChange;
      if (waitForDomChange === undefined) {
        break;
      }
      await waitForDomChange.call(this.page, { timeoutMs: DOM_WAIT_MS, debounceMs: 75 });
    }

    if (afterConversationId !== undefined && !cursorReached) {
      throw new WebAutomationError(
        'INVALID_REQUEST',
        'Conversation cursor could not be resumed from the current provider history.',
      );
    }

    if (seen.size === 0) {
      await throwForUnverifiableHistory(this.page);
    }

    return { conversations };
  }

  private async requireConversationLocator(): Promise<LocatorCandidate> {
    const resolver = new ChatGptTargetResolver(this.page);
    let lastHealth: ChatGptPageHealth = 'UNKNOWN';

    for (let round = 0; round < MAX_STALLED_ROUNDS; round += 1) {
      const locator = await resolver.findExisting('conversation-link');
      if (locator !== undefined) {
        return locator;
      }

      lastHealth = await new ChatGptPageHealthProbe(this.page).check();
      throwIfDegraded(lastHealth);

      const waitForDomChange = this.page.waitForDomChange;
      if (waitForDomChange === undefined || round === MAX_STALLED_ROUNDS - 1) {
        break;
      }
      await waitForDomChange.call(this.page, { timeoutMs: DOM_WAIT_MS, debounceMs: 75 });
    }

    if (lastHealth === 'HEALTHY') {
      throw new WebAutomationError(
        'PROVIDER_CHANGED',
        'Authenticated ChatGPT page did not expose a verifiable conversation history state.',
      );
    }

    throw new WebAutomationError(
      'PROVIDER_UNAVAILABLE',
      'ChatGPT conversation history did not become ready during bounded stabilization.',
    );
  }
}

async function tryScrollToLast(
  page: BrowserPagePort,
  locator: LocatorCandidate,
  index: number,
): Promise<void> {
  try {
    await page.scrollIntoView?.call(page, locator, index);
  } catch {
    // Virtualized history can replace rows between snapshot and scroll. A later
    // semantic read decides whether progress actually occurred.
  }
}

async function throwForUnverifiableHistory(page: BrowserPagePort): Promise<never> {
  const health = await new ChatGptPageHealthProbe(page).check();
  throwIfDegraded(health);

  if (health === 'HEALTHY') {
    throw new WebAutomationError(
      'PROVIDER_CHANGED',
      'ChatGPT history locator was present but produced no valid conversation identities.',
    );
  }

  throw new WebAutomationError(
    'PROVIDER_UNAVAILABLE',
    'ChatGPT conversation history could not be verified.',
  );
}

function throwIfDegraded(health: ChatGptPageHealth): void {
  if (health === 'RATE_LIMITED') {
    throw new WebAutomationError(
      'PROVIDER_RATE_LIMITED',
      'ChatGPT is temporarily limiting requests for this browser session.',
    );
  }
  if (health === 'PROVIDER_ERROR') {
    throw new WebAutomationError(
      'PROVIDER_UNAVAILABLE',
      'ChatGPT reported an error while loading conversation history.',
    );
  }
}

function parseConversationId(href: string | null | undefined): string | undefined {
  if (href === null || href === undefined) {
    return undefined;
  }

  const relativeMatch = href.match(/^\/c\/([^/?#]+)/);
  if (relativeMatch?.[1] !== undefined) {
    return decodeConversationId(relativeMatch[1]);
  }

  try {
    const url = new URL(href);
    const absoluteMatch = url.pathname.match(/^\/c\/([^/?#]+)/);
    if (absoluteMatch?.[1] === undefined) {
      return undefined;
    }
    return decodeConversationId(absoluteMatch[1]);
  } catch {
    return undefined;
  }
}

function decodeConversationId(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function encodeCursor(afterConversationId: string): ConversationCursor {
  const payload: ConversationCursorPayload = {
    version: CURSOR_VERSION,
    afterConversationId,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(cursor: ConversationCursor | undefined): string | undefined {
  if (cursor === undefined) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<ConversationCursorPayload>;
    if (
      parsed.version !== CURSOR_VERSION ||
      typeof parsed.afterConversationId !== 'string' ||
      parsed.afterConversationId.length === 0
    ) {
      throw new Error('invalid cursor payload');
    }
    return parsed.afterConversationId;
  } catch (error) {
    throw new WebAutomationError('INVALID_REQUEST', 'Conversation cursor is invalid.', { cause: error });
  }
}
