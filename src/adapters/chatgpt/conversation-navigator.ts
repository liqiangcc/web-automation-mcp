import type { ConversationId } from '../../domain/conversation.js';
import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort } from '../../ports/browser-port.js';
import { CHATGPT_URL } from './chatgpt-config.js';

export interface ChatGptConversationNavigatorPort {
  open(conversationId?: ConversationId): Promise<void>;
  currentConversationId(): ConversationId;
}

export class ChatGptConversationNavigator implements ChatGptConversationNavigatorPort {
  public constructor(private readonly page: BrowserPagePort) {}

  public async open(conversationId?: ConversationId): Promise<void> {
    if (conversationId === undefined) {
      await this.page.goto(CHATGPT_URL);
      return;
    }

    if (conversationId.trim().length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'conversationId must not be empty');
    }

    await this.page.goto(`${CHATGPT_URL}c/${encodeURIComponent(conversationId)}`);
  }

  public currentConversationId(): ConversationId {
    const currentUrl = this.page.currentUrl?.();
    if (currentUrl === undefined) {
      throw new WebAutomationError(
        'PROVIDER_CHANGED',
        'Browser page adapter cannot expose the current URL needed for ChatGPT conversation persistence',
      );
    }

    let pathname: string;
    try {
      pathname = new URL(currentUrl).pathname;
    } catch (error) {
      throw new WebAutomationError('EXTRACTION_FAILED', 'ChatGPT returned an invalid conversation URL', {
        cause: error,
      });
    }

    const match = /^\/c\/([^/]+)\/?$/.exec(pathname);
    if (match?.[1] === undefined) {
      throw new WebAutomationError(
        'EXTRACTION_FAILED',
        `Could not capture a ChatGPT conversation id from URL: ${currentUrl}`,
      );
    }

    try {
      return decodeURIComponent(match[1]);
    } catch (error) {
      throw new WebAutomationError('EXTRACTION_FAILED', 'ChatGPT conversation id is not valid URL encoding', {
        cause: error,
      });
    }
  }
}
