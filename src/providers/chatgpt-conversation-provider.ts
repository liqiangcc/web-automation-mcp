import {
  ChatGptAssistantResponseReader,
  lastAssistantResponse,
} from '../adapters/chatgpt/assistant-responses.js';
import { requireAuthenticatedChatGptSession } from '../adapters/chatgpt/authentication.js';
import { ChatGptConversationCatalog } from '../adapters/chatgpt/conversation-catalog.js';
import { ChatGptConversationMutation } from '../adapters/chatgpt/conversation-mutation.js';
import { ChatGptConversationNavigator } from '../adapters/chatgpt/conversation-navigator.js';
import { ChatGptConversationReader } from '../adapters/chatgpt/conversation-reader.js';
import type { ProfileId } from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';
import type { BrowserSessionPort } from '../ports/browser-session-port.js';
import type {
  ConversationCatalogInput,
  ConversationCatalogPort,
} from '../ports/conversation-catalog-port.js';
import type {
  ConversationMutationInput,
  ConversationMutationPort,
} from '../ports/conversation-mutation-port.js';
import type {
  ConversationReaderInput,
  ConversationReaderPort,
} from '../ports/conversation-reader-port.js';
import type {
  ProviderConversationPort,
  ProviderLastResponseInput,
  ProviderLastResponseOutput,
  ProviderNewChatOutput,
} from '../ports/provider-conversation-port.js';

export class ChatGptConversationProvider
  implements
    ProviderConversationPort,
    ConversationCatalogPort,
    ConversationReaderPort,
    ConversationMutationPort
{
  public readonly id = 'chatgpt' as const;

  public constructor(private readonly sessions: BrowserSessionPort) {}

  public async list(input: ConversationCatalogInput) {
    const session = await this.sessions.acquire(this.id, input.profileId);
    try {
      await new ChatGptConversationNavigator(session.page).open();
      await requireAuthenticatedChatGptSession(session.page);
      return await new ChatGptConversationCatalog(session.page).list(input);
    } finally {
      await session.close();
    }
  }

  public async get(input: ConversationReaderInput) {
    const session = await this.sessions.acquire(this.id, input.profileId);
    try {
      const navigator = new ChatGptConversationNavigator(session.page);
      await navigator.open(input.conversationId);
      await requireAuthenticatedChatGptSession(session.page);
      return await new ChatGptConversationReader(session.page).read(input.conversationId);
    } finally {
      await session.close();
    }
  }

  public async delete(input: ConversationMutationInput): Promise<void> {
    const session = await this.sessions.acquire(this.id, input.profileId);
    try {
      await requireAuthenticatedChatGptSession(session.page);
      await new ChatGptConversationMutation(session.page).delete(input.conversationId);
    } finally {
      await session.close();
    }
  }

  public async newChat(profileId: ProfileId): Promise<ProviderNewChatOutput> {
    const session = await this.sessions.acquire(this.id, profileId);
    try {
      await new ChatGptConversationNavigator(session.page).open();
      await requireAuthenticatedChatGptSession(session.page);
      return { status: 'READY' };
    } finally {
      await session.close();
    }
  }

  public async getLastResponse(
    input: ProviderLastResponseInput,
  ): Promise<ProviderLastResponseOutput> {
    const session = await this.sessions.acquire(this.id, input.profileId);
    try {
      await new ChatGptConversationNavigator(session.page).open(input.conversationId);
      await requireAuthenticatedChatGptSession(session.page);

      const responses = await new ChatGptAssistantResponseReader(session.page).read();
      const responseText = lastAssistantResponse(responses);
      if (responseText === undefined) {
        throw new WebAutomationError(
          'EXTRACTION_FAILED',
          `No assistant response was found in ChatGPT conversation ${input.conversationId}`,
        );
      }

      return { responseText };
    } finally {
      await session.close();
    }
  }
}
