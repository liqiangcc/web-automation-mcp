import { PlaywrightBrowserAdapter } from '../adapters/playwright/playwright-browser.js';
import { AskUseCase } from '../application/ask.js';
import { AskToFileUseCase } from '../application/ask-to-file.js';
import { ConversationUseCases } from '../application/conversation.js';
import { ObservedAutomationApplication } from '../application/observed-application.js';
import {
  FileDiagnosticsBundleSink,
  JsonLineLifecycleSink,
} from '../infrastructure/observability.js';
import { RestrictedAtomicAnswerFileWriter } from '../infrastructure/answer-file.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';
import { ChatGptConversationProvider } from '../providers/chatgpt-conversation-provider.js';
import { ChatGptProvider } from '../providers/chatgpt-provider.js';
import { ChatGptSessionStatusProvider } from '../providers/chatgpt-session-status-provider.js';
import { BrowserSessionManager } from '../session/browser-session.js';

export function createDefaultAutomationApplication(): AutomationApplicationPort {
  const headless = process.env.WEB_AUTOMATION_MCP_HEADLESS !== 'false';
  const sessions = new BrowserSessionManager(new PlaywrightBrowserAdapter(), undefined, undefined, {
    headless,
  });
  const chatGptProvider = new ChatGptProvider(sessions);
  const askUseCase = new AskUseCase(new Map([[chatGptProvider.id, chatGptProvider]]));
  const askToFileUseCase = new AskToFileUseCase(askUseCase, new RestrictedAtomicAnswerFileWriter());
  const sessionStatusProvider = new ChatGptSessionStatusProvider(sessions);
  const conversationProvider = new ChatGptConversationProvider(sessions);
  const conversationUseCases = new ConversationUseCases(
    new Map([[conversationProvider.id, conversationProvider]]),
  );

  const application: AutomationApplicationPort = {
    ask: (request) => askUseCase.execute(request),
    askToFile: (request) => askToFileUseCase.execute(request),
    sessionStatus: (request) => sessionStatusProvider.check(request.profileId),
    newChat: (request) => conversationUseCases.newChat(request),
    getLastResponse: (request) => conversationUseCases.getLastResponse(request),
  };

  return new ObservedAutomationApplication(application, {
    lifecycle: new JsonLineLifecycleSink(),
    diagnostics: new FileDiagnosticsBundleSink(),
  });
}
