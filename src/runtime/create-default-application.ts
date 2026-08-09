import { PlaywrightBrowserAdapter } from '../adapters/playwright/playwright-browser.js';
import { AskUseCase } from '../application/ask.js';
import { AskToFileUseCase } from '../application/ask-to-file.js';
import { AskWithFilesUseCase } from '../application/ask-with-files.js';
import { ConversationUseCases } from '../application/conversation.js';
import { ObservedAutomationApplication } from '../application/observed-application.js';
import { RestrictedAtomicAnswerFileWriter } from '../infrastructure/answer-file.js';
import { RestrictedInputFileResolver } from '../infrastructure/input-file.js';
import {
  FileDiagnosticsBundleSink,
  JsonLineLifecycleSink,
} from '../infrastructure/observability.js';
import type { AttachmentApplicationPort } from '../ports/attachment-application-port.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';
import { ChatGptAttachmentProvider } from '../providers/chatgpt-attachment-provider.js';
import { ChatGptConversationProvider } from '../providers/chatgpt-conversation-provider.js';
import { ChatGptProvider } from '../providers/chatgpt-provider.js';
import { ChatGptSessionStatusProvider } from '../providers/chatgpt-session-status-provider.js';
import { BrowserSessionManager } from '../session/browser-session.js';
import { resolveWorkspacePaths } from './workspace-paths.js';

export function createDefaultAutomationApplication(): AutomationApplicationPort & AttachmentApplicationPort {
  const headless = process.env.WEB_AUTOMATION_MCP_HEADLESS !== 'false';
  const workspacePaths = resolveWorkspacePaths(process.cwd(), process.env);
  const maxInputFileBytes = configuredMaxInputFileBytes(
    process.env.WEB_AUTOMATION_MCP_MAX_INPUT_FILE_BYTES,
  );
  const sessions = new BrowserSessionManager(new PlaywrightBrowserAdapter(), undefined, undefined, {
    headless,
  });
  const chatGptProvider = new ChatGptProvider(sessions);
  const askUseCase = new AskUseCase(new Map([[chatGptProvider.id, chatGptProvider]]));
  const chatGptAttachmentProvider = new ChatGptAttachmentProvider(sessions);
  const askWithFilesUseCase = new AskWithFilesUseCase(
    new Map([[chatGptAttachmentProvider.id, chatGptAttachmentProvider]]),
    new RestrictedInputFileResolver(
      workspacePaths.inputRoot,
      maxInputFileBytes === undefined ? {} : { maxFileBytes: maxInputFileBytes },
    ),
  );
  const askToFileUseCase = new AskToFileUseCase(
    askUseCase,
    new RestrictedAtomicAnswerFileWriter(workspacePaths.outputRoot),
  );
  const sessionStatusProvider = new ChatGptSessionStatusProvider(sessions);
  const conversationProvider = new ChatGptConversationProvider(sessions);
  const conversationUseCases = new ConversationUseCases(
    new Map([[conversationProvider.id, conversationProvider]]),
  );

  const application: AutomationApplicationPort & AttachmentApplicationPort = {
    ask: (request) => askUseCase.execute(request),
    askWithFiles: (request) => askWithFilesUseCase.execute(request),
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

function configuredMaxInputFileBytes(rawValue: string | undefined): number | undefined {
  return rawValue === undefined || rawValue.trim().length === 0 ? undefined : Number(rawValue);
}
