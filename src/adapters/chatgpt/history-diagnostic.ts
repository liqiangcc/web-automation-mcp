import type { BrowserPagePort } from '../../ports/browser-port.js';
import { WebAutomationError } from '../../domain/errors.js';
import { ChatGptPageHealthProbe, type ChatGptPageHealth } from './page-health.js';
import { ChatGptTargetResolver } from './target-resolver.js';

export interface ChatGptHistoryDiagnosticResult {
  readonly pageHealth: ChatGptPageHealth;
  readonly conversationLocatorFound: boolean;
  readonly matchedElementCount: number;
  readonly relativeHrefCount: number;
  readonly absoluteChatGptHrefCount: number;
  readonly otherHrefCount: number;
  readonly missingHrefCount: number;
}

export class ChatGptHistoryDiagnostic {
  public constructor(private readonly page: BrowserPagePort) {}

  public async inspect(): Promise<ChatGptHistoryDiagnosticResult> {
    const pageHealth = await new ChatGptPageHealthProbe(this.page).check();
    const locator = await new ChatGptTargetResolver(this.page).findExisting('conversation-link');
    if (locator === undefined) {
      return emptyResult(pageHealth);
    }

    const elementSnapshots = this.page.elementSnapshots;
    if (elementSnapshots === undefined) {
      throw new WebAutomationError(
        'PROVIDER_CHANGED',
        'Browser adapter does not expose element snapshots required for safe history diagnostics.',
      );
    }

    const snapshots = await elementSnapshots.call(this.page, locator, ['href']);
    let relativeHrefCount = 0;
    let absoluteChatGptHrefCount = 0;
    let otherHrefCount = 0;
    let missingHrefCount = 0;

    for (const snapshot of snapshots) {
      const href = snapshot.attributes.href;
      switch (classifyHref(href)) {
        case 'relative':
          relativeHrefCount += 1;
          break;
        case 'absolute-chatgpt':
          absoluteChatGptHrefCount += 1;
          break;
        case 'other':
          otherHrefCount += 1;
          break;
        case 'missing':
          missingHrefCount += 1;
          break;
      }
    }

    return {
      pageHealth,
      conversationLocatorFound: true,
      matchedElementCount: snapshots.length,
      relativeHrefCount,
      absoluteChatGptHrefCount,
      otherHrefCount,
      missingHrefCount,
    };
  }
}

function emptyResult(pageHealth: ChatGptPageHealth): ChatGptHistoryDiagnosticResult {
  return {
    pageHealth,
    conversationLocatorFound: false,
    matchedElementCount: 0,
    relativeHrefCount: 0,
    absoluteChatGptHrefCount: 0,
    otherHrefCount: 0,
    missingHrefCount: 0,
  };
}

function classifyHref(
  href: string | null | undefined,
): 'relative' | 'absolute-chatgpt' | 'other' | 'missing' {
  if (href === null || href === undefined || href.length === 0) {
    return 'missing';
  }
  if (/^\/c\/[^/?#]+/.test(href)) {
    return 'relative';
  }

  try {
    const url = new URL(href);
    if (url.hostname === 'chatgpt.com' && /^\/c\/[^/?#]+/.test(url.pathname)) {
      return 'absolute-chatgpt';
    }
    return 'other';
  } catch {
    return 'other';
  }
}
