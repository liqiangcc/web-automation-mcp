import {
  ChatGptConversationNavigator,
  type ChatGptConversationNavigatorPort,
} from '../adapters/chatgpt/conversation-navigator.js';
import { ChatGptPageWorkflow } from '../adapters/chatgpt/page-workflow.js';
import type { BrowserPagePort } from '../ports/browser-port.js';
import type { BrowserSessionPort } from '../ports/browser-session-port.js';
import type {
  ProviderAskWithFilesInput,
  ProviderAskWithFilesOutput,
  ProviderAttachmentPort,
} from '../ports/provider-attachment-port.js';

interface ChatGptAttachmentWorkflowPort {
  askWithFiles(prompt: string, filePaths: readonly string[]): Promise<string>;
}

export interface ChatGptAttachmentProviderDependencies {
  readonly createNavigator?: (page: BrowserPagePort) => ChatGptConversationNavigatorPort;
  readonly createWorkflow?: (page: BrowserPagePort) => ChatGptAttachmentWorkflowPort;
}

export class ChatGptAttachmentProvider implements ProviderAttachmentPort {
  public readonly id = 'chatgpt' as const;
  private readonly createNavigator: (page: BrowserPagePort) => ChatGptConversationNavigatorPort;
  private readonly createWorkflow: (page: BrowserPagePort) => ChatGptAttachmentWorkflowPort;

  public constructor(
    private readonly sessions: BrowserSessionPort,
    dependencies: ChatGptAttachmentProviderDependencies = {},
  ) {
    this.createNavigator =
      dependencies.createNavigator ?? ((page) => new ChatGptConversationNavigator(page));
    this.createWorkflow = dependencies.createWorkflow ?? ((page) => new ChatGptPageWorkflow(page));
  }

  public async askWithFiles(
    input: ProviderAskWithFilesInput,
  ): Promise<ProviderAskWithFilesOutput> {
    const session = await this.sessions.acquire(this.id, input.profileId);

    try {
      const navigator = this.createNavigator(session.page);
      await navigator.open(input.conversationId);
      const responseText = await this.createWorkflow(session.page).askWithFiles(
        input.prompt,
        input.filePaths,
      );
      return {
        conversationId: navigator.currentConversationId(),
        responseText,
      };
    } finally {
      await session.close();
    }
  }
}
