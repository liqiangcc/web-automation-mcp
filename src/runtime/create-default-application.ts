import { PlaywrightBrowserAdapter } from '../adapters/playwright/playwright-browser.js';
import { AskUseCase } from '../application/ask.js';
import { ConversationUseCases } from '../application/conversation.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';
import { ChatGptConversationProvider } from '../providers/chatgpt-conversation-provider.js';
import { ChatGptProvider } from '../providers/chatgpt-provider.js';
import { ChatGptSessionStatusProvider } from '../providers/chatgpt-session-status-provider.js';
import { BrowserSessionManager } from '../session/browser-session.js';

export function createDefaultAutomationApplication(): AutomationApplicationPort {
  const sessions = new BrowserSessionManager(new PlaywrightBrowserAdapter());
  const chatGptProvider = new ChatGptProvider(sessions);
  const askUseCase = new AskUseCase(new Map([[chatGptProvider.id, chatGptProvider]]));
  const sessionStatusProvider = new ChatGptSessionStatusProvider(sessions);
  const conversationProvider = new ChatGptConversationProvider(sessions);
  const conversationUseCases = new ConversationUseCases(
    new Map([[conversationProvider.id, conversationProvider]]),
  );

  return {
    ask: (request) => askUseCase.execute(request),
    sessionStatus: (request) => sessionStatusProvider.check(request.profileId),
    newChat: (request) => conversationUseCases.newChat(request),
    getLastResponse: (request) => conversationUseCases.getLastResponse(request),
  };
}
