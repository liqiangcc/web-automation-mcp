import { PlaywrightBrowserAdapter } from '../adapters/playwright/playwright-browser.js';
import { AskUseCase } from '../application/ask.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';
import { ChatGptProvider } from '../providers/chatgpt-provider.js';
import { ChatGptSessionStatusProvider } from '../providers/chatgpt-session-status-provider.js';
import { BrowserSessionManager } from '../session/browser-session.js';

export function createDefaultAutomationApplication(): AutomationApplicationPort {
  const sessions = new BrowserSessionManager(new PlaywrightBrowserAdapter());
  const chatGptProvider = new ChatGptProvider(sessions);
  const askUseCase = new AskUseCase(new Map([[chatGptProvider.id, chatGptProvider]]));
  const sessionStatusProvider = new ChatGptSessionStatusProvider(sessions);

  return {
    ask: (request) => askUseCase.execute(request),
    sessionStatus: (request) => sessionStatusProvider.check(request.profileId),
  };
}
