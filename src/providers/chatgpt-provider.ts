import {
  ChatGptConversationNavigator,
  type ChatGptConversationNavigatorPort,
} from '../adapters/chatgpt/conversation-navigator.js';
import {
  ChatGptPageWorkflow,
  type ChatGptPageWorkflowResult,
} from '../adapters/chatgpt/page-workflow.js';
import type { BrowserPagePort } from '../ports/browser-port.js';
import type { BrowserSessionPort } from '../ports/browser-session-port.js';
import type {
  ProviderAskInput,
  ProviderAskOutput,
  ProviderPort,
} from '../ports/provider-port.js';

interface ChatGptPageWorkflowPort {
  ask(prompt: string): Promise<string>;
  askWithMetadata?(prompt: string): Promise<ChatGptPageWorkflowResult>;
}

export interface ChatGptProviderDependencies {
  readonly createNavigator?: (page: BrowserPagePort) => ChatGptConversationNavigatorPort;
  readonly createWorkflow?: (page: BrowserPagePort) => ChatGptPageWorkflowPort;
}

export class ChatGptProvider implements ProviderPort {
  public readonly id = 'chatgpt' as const;
  private readonly createNavigator: (page: BrowserPagePort) => ChatGptConversationNavigatorPort;
  private readonly createWorkflow: (page: BrowserPagePort) => ChatGptPageWorkflowPort;

  public constructor(
    private readonly sessions: BrowserSessionPort,
    dependencies: ChatGptProviderDependencies = {},
  ) {
    this.createNavigator = dependencies.createNavigator ?? ((page) => new ChatGptConversationNavigator(page));
    this.createWorkflow = dependencies.createWorkflow ?? ((page) => new ChatGptPageWorkflow(page));
  }

  public async ask(input: ProviderAskInput): Promise<ProviderAskOutput> {
    const session = await this.sessions.acquire(this.id, input.profileId);

    try {
      const navigator = this.createNavigator(session.page);
      await navigator.open(input.conversationId);

      const workflow = this.createWorkflow(session.page);
      const askWithMetadata = workflow.askWithMetadata;
      const result =
        askWithMetadata === undefined
          ? { responseText: await workflow.ask(input.prompt) }
          : await askWithMetadata.call(workflow, input.prompt);
      const conversationId = navigator.currentConversationId();

      return {
        conversationId,
        responseText: result.responseText,
        ...('completion' in result ? { completion: result.completion } : {}),
      };
    } finally {
      await session.close();
    }
  }
}
