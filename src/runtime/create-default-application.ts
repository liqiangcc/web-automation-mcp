import { PlaywrightBrowserAdapter } from '../adapters/playwright/playwright-browser.js';
import { AskUseCase } from '../application/ask.js';
import { AskToFileUseCase } from '../application/ask-to-file.js';
import { AskWithFilesUseCase } from '../application/ask-with-files.js';
import { ConversationUseCases } from '../application/conversation.js';
import { DeleteConversationUseCase } from '../application/delete-conversation.js';
import { ExportConversationUseCase } from '../application/export-conversation.js';
import { GetConversationUseCase } from '../application/get-conversation.js';
import { ListConversationsUseCase } from '../application/list-conversations.js';
import { ObservedAutomationApplication } from '../application/observed-application.js';
import { RestrictedAtomicAnswerFileWriter } from '../infrastructure/answer-file.js';
import { RestrictedInputFileResolver } from '../infrastructure/input-file.js';
import {
  FileDiagnosticsBundleSink,
  JsonLineLifecycleSink,
} from '../infrastructure/observability.js';
import type { AttachmentApplicationPort } from '../ports/attachment-application-port.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';
import type { ConversationCatalogApplicationPort } from '../ports/conversation-catalog-port.js';
import type { ConversationExportApplicationPort } from '../ports/conversation-export-port.js';
import type { ConversationMutationApplicationPort } from '../ports/conversation-mutation-port.js';
import type { ConversationReaderApplicationPort } from '../ports/conversation-reader-port.js';
import { ChatGptAttachmentProvider } from '../providers/chatgpt-attachment-provider.js';
import { ChatGptConversationProvider } from '../providers/chatgpt-conversation-provider.js';
import { ChatGptProvider } from '../providers/chatgpt-provider.js';
import { ChatGptSessionStatusProvider } from '../providers/chatgpt-session-status-provider.js';
import { BrowserSessionManager } from '../session/browser-session.js';
import { resolveWorkspacePaths } from './workspace-paths.js';

export function createDefaultAutomationApplication(): AutomationApplicationPort &
  AttachmentApplicationPort &
  ConversationCatalogApplicationPort &
  ConversationReaderApplicationPort &
  ConversationExportApplicationPort &
  ConversationMutationApplicationPort {
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
  const answerFiles = new RestrictedAtomicAnswerFileWriter(workspacePaths.outputRoot);
  const askToFileUseCase = new AskToFileUseCase(askUseCase, answerFiles);
  const sessionStatusProvider = new ChatGptSessionStatusProvider(sessions);
  const conversationProvider = new ChatGptConversationProvider(sessions);
  const conversationUseCases = new ConversationUseCases(
    new Map([[conversationProvider.id, conversationProvider]]),
  );
  const conversationReaders = new Map([[conversationProvider.id, conversationProvider]]);
  const conversationMutations = new Map([[conversationProvider.id, conversationProvider]]);
  const listConversationsUseCase = new ListConversationsUseCase(
    new Map([[conversationProvider.id, conversationProvider]]),
  );
  const getConversationUseCase = new GetConversationUseCase(conversationReaders);
  const exportConversationUseCase = new ExportConversationUseCase(
    conversationReaders,
    answerFiles,
  );
  const deleteConversationUseCase = new DeleteConversationUseCase(conversationMutations);

  const application: AutomationApplicationPort &
    AttachmentApplicationPort &
    ConversationCatalogApplicationPort &
    ConversationReaderApplicationPort &
    ConversationExportApplicationPort &
    ConversationMutationApplicationPort = {
    ask: (request) => askUseCase.execute(request),
    askWithFiles: (request) => askWithFilesUseCase.execute(request),
    askToFile: (request) => askToFileUseCase.execute(request),
    sessionStatus: (request) => sessionStatusProvider.check(request.profileId),
    newChat: (request) => conversationUseCases.newChat(request),
    getLastResponse: (request) => conversationUseCases.getLastResponse(request),
    listConversations: (request) => listConversationsUseCase.listConversations(request),
    getConversation: (request) => getConversationUseCase.getConversation(request),
    exportConversationToFile: (request) =>
      exportConversationUseCase.exportConversationToFile(request),
    deleteConversation: (request) => deleteConversationUseCase.deleteConversation(request),
  };

  return new ObservedAutomationApplication(application, {
    lifecycle: new JsonLineLifecycleSink(),
    diagnostics: new FileDiagnosticsBundleSink(),
  });
}

function configuredMaxInputFileBytes(rawValue: string | undefined): number | undefined {
  return rawValue === undefined || rawValue.trim().length === 0 ? undefined : Number(rawValue);
}
