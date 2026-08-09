import type {
  ConversationId,
  ConversationMessage,
  ConversationMessageRole,
  ConversationTranscript,
} from '../../domain/conversation.js';
import { WebAutomationError } from '../../domain/errors.js';
import type {
  BrowserElementSnapshot,
  BrowserPagePort,
  LocatorCandidate,
} from '../../ports/browser-port.js';
import { ChatGptConversationNavigator } from './conversation-navigator.js';
import { ChatGptTargetResolver } from './target-resolver.js';

const DOM_WAIT_MS = 750;
const MAX_READ_ROUNDS = 10;
const REQUIRED_STABLE_ROUNDS = 2;

export class ChatGptConversationReader {
  public constructor(private readonly page: BrowserPagePort) {}

  public async read(conversationId: ConversationId): Promise<ConversationTranscript> {
    const currentConversationId = new ChatGptConversationNavigator(this.page).currentConversationId();
    if (currentConversationId !== conversationId) {
      throw new WebAutomationError(
        'CONVERSATION_NOT_FOUND',
        'The requested ChatGPT conversation could not be opened.',
      );
    }

    const elementSnapshots = this.page.elementSnapshots;
    const scrollIntoView = this.page.scrollIntoView;
    const waitForDomChange = this.page.waitForDomChange;
    if (
      elementSnapshots === undefined ||
      scrollIntoView === undefined ||
      waitForDomChange === undefined
    ) {
      throw new WebAutomationError(
        'PROVIDER_CHANGED',
        'Browser adapter does not expose the generic mechanics required for complete conversation reading.',
      );
    }

    let locator = await new ChatGptTargetResolver(this.page).findExisting('conversation-message');
    if (locator === undefined) {
      locator = await waitForMessageTarget(this.page, waitForDomChange);
    }
    if (locator === undefined) {
      throw new WebAutomationError(
        'CONVERSATION_NOT_FOUND',
        'No messages were found in the requested ChatGPT conversation.',
      );
    }

    let previousFingerprint: string | undefined;
    let stableRounds = 0;
    let latestMessages: readonly ConversationMessage[] = [];

    for (let round = 0; round < MAX_READ_ROUNDS; round += 1) {
      const snapshots = await elementSnapshots.call(this.page, locator, ['data-message-author-role']);
      const messages = snapshotsToMessages(snapshots);
      const fingerprint = fingerprintMessages(messages);

      if (messages.length > 0 && fingerprint === previousFingerprint) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }
      previousFingerprint = fingerprint;
      latestMessages = messages;

      if (latestMessages.length > 0 && stableRounds >= REQUIRED_STABLE_ROUNDS) {
        return {
          conversationId,
          messages: latestMessages,
        };
      }

      if (snapshots.length > 0) {
        try {
          await scrollIntoView.call(this.page, locator, 0);
        } catch {
          // A provider may replace message rows while older content is materializing.
          // The next semantic snapshot determines whether transcript progress occurred.
        }
      }
      await waitForDomChange.call(this.page, { timeoutMs: DOM_WAIT_MS, debounceMs: 75 });
    }

    if (latestMessages.length === 0) {
      throw new WebAutomationError(
        'CONVERSATION_NOT_FOUND',
        'No readable messages were found in the requested ChatGPT conversation.',
      );
    }

    throw new WebAutomationError(
      'CONVERSATION_INCOMPLETE',
      'The requested ChatGPT conversation did not reach a stable complete transcript.',
    );
  }
}

async function waitForMessageTarget(
  page: BrowserPagePort,
  waitForDomChange: NonNullable<BrowserPagePort['waitForDomChange']>,
): Promise<LocatorCandidate | undefined> {
  const resolver = new ChatGptTargetResolver(page);
  for (let round = 0; round < 3; round += 1) {
    await waitForDomChange.call(page, { timeoutMs: DOM_WAIT_MS, debounceMs: 75 });
    const locator = await resolver.findExisting('conversation-message');
    if (locator !== undefined) {
      return locator;
    }
  }
  return undefined;
}

function snapshotsToMessages(
  snapshots: readonly BrowserElementSnapshot[],
): readonly ConversationMessage[] {
  const messages: ConversationMessage[] = [];
  for (const snapshot of snapshots) {
    const text = snapshot.text.trim();
    if (text.length === 0) {
      continue;
    }
    messages.push({
      role: normalizeRole(snapshot.attributes['data-message-author-role']),
      text,
    });
  }
  return messages;
}

function normalizeRole(rawRole: string | null | undefined): ConversationMessageRole {
  switch (rawRole) {
    case 'user':
    case 'assistant':
    case 'system':
      return rawRole;
    default:
      return 'other';
  }
}

function fingerprintMessages(messages: readonly ConversationMessage[]): string {
  return JSON.stringify(messages);
}
