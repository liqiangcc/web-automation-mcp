import type { CallToolResult } from '@modelcontextprotocol/server';

import type {
  AskRequest,
  AskToFileRequest,
  AskWithFilesRequest,
  ConversationCursor,
  ConversationId,
  ProfileId,
  ProviderId,
} from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';
import type { AttachmentApplicationPort } from '../ports/attachment-application-port.js';
import type {
  AutomationApplicationPort,
  LastResponseRequest,
  NewChatRequest,
  SessionStatusRequest,
} from '../ports/automation-application-port.js';
import type {
  ConversationCatalogApplicationPort,
  ListConversationsRequest,
} from '../ports/conversation-catalog-port.js';
import type {
  ConversationReaderApplicationPort,
  GetConversationRequest,
} from '../ports/conversation-reader-port.js';

export interface WebSessionStatusToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
}

export interface WebAskToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly prompt: string;
  readonly conversationId?: ConversationId;
}

export interface WebAskWithFilesToolInput extends WebAskToolInput {
  readonly files: readonly string[];
}

export interface WebAskToFileToolInput extends WebAskToolInput {
  readonly outputPath: string;
  readonly overwrite?: boolean;
}

export interface WebNewChatToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
}

export interface WebGetLastResponseToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
}

export interface WebListConversationsToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly limit?: number;
  readonly cursor?: ConversationCursor;
}

export interface WebGetConversationToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
}

export async function handleWebSessionStatus(
  input: WebSessionStatusToolInput,
  application: AutomationApplicationPort,
): Promise<CallToolResult> {
  try {
    const request: SessionStatusRequest = {
      provider: input.provider,
      profileId: input.profileId,
    };
    const result = await application.sessionStatus(request);
    return {
      content: [{ type: 'text', text: result.status }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        status: result.status,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export async function handleWebListConversations(
  input: WebListConversationsToolInput,
  application: Partial<ConversationCatalogApplicationPort>,
): Promise<CallToolResult> {
  try {
    const listConversations = application.listConversations;
    if (listConversations === undefined) {
      throw new Error('Conversation catalog application capability is not configured.');
    }
    const request: ListConversationsRequest = {
      provider: input.provider,
      profileId: input.profileId,
      ...(input.limit === undefined ? {} : { limit: input.limit }),
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    };
    const result = await listConversations.call(application, request);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result.conversations),
        },
      ],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversations: result.conversations,
        ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export async function handleWebGetConversation(
  input: WebGetConversationToolInput,
  application: Partial<ConversationReaderApplicationPort>,
): Promise<CallToolResult> {
  try {
    const getConversation = application.getConversation;
    if (getConversation === undefined) {
      throw new Error('Conversation reader application capability is not configured.');
    }
    const request: GetConversationRequest = {
      provider: input.provider,
      profileId: input.profileId,
      conversationId: input.conversationId,
    };
    const result = await getConversation.call(application, request);
    return {
      content: [{ type: 'text', text: JSON.stringify(result.messages) }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversationId: result.conversationId,
        ...(result.title === undefined ? {} : { title: result.title }),
        messages: result.messages,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export async function handleWebAsk(
  input: WebAskToolInput,
  application: AutomationApplicationPort,
): Promise<CallToolResult> {
  try {
    const request: AskRequest = {
      provider: input.provider,
      profileId: input.profileId,
      prompt: input.prompt,
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
    };
    const result = await application.ask(request);
    return {
      content: [{ type: 'text', text: result.responseText }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversationId: result.conversationId,
        responseText: result.responseText,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export async function handleWebAskWithFiles(
  input: WebAskWithFilesToolInput,
  application: AutomationApplicationPort & Partial<AttachmentApplicationPort>,
): Promise<CallToolResult> {
  try {
    const askWithFiles = application.askWithFiles;
    if (askWithFiles === undefined) {
      throw new Error('Attachment application capability is not configured.');
    }
    const request: AskWithFilesRequest = {
      provider: input.provider,
      profileId: input.profileId,
      prompt: input.prompt,
      files: input.files,
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
    };
    const result = await askWithFiles.call(application, request);
    return {
      content: [{ type: 'text', text: result.responseText }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversationId: result.conversationId,
        responseText: result.responseText,
        fileCount: result.fileCount,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export async function handleWebAskToFile(
  input: WebAskToFileToolInput,
  application: AutomationApplicationPort,
): Promise<CallToolResult> {
  try {
    const request: AskToFileRequest = {
      provider: input.provider,
      profileId: input.profileId,
      prompt: input.prompt,
      outputPath: input.outputPath,
      overwrite: input.overwrite ?? false,
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId }),
    };
    const result = await application.askToFile(request);
    return {
      content: [
        {
          type: 'text',
          text: `Saved web AI response to ${result.filePath} (${result.bytesWritten} bytes).`,
        },
      ],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversationId: result.conversationId,
        filePath: result.filePath,
        bytesWritten: result.bytesWritten,
        sha256: result.sha256,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export async function handleWebNewChat(
  input: WebNewChatToolInput,
  application: AutomationApplicationPort,
): Promise<CallToolResult> {
  try {
    const request: NewChatRequest = {
      provider: input.provider,
      profileId: input.profileId,
    };
    const result = await application.newChat(request);
    return {
      content: [{ type: 'text', text: result.status }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        status: result.status,
        conversationId: null,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export async function handleWebGetLastResponse(
  input: WebGetLastResponseToolInput,
  application: AutomationApplicationPort,
): Promise<CallToolResult> {
  try {
    const request: LastResponseRequest = {
      provider: input.provider,
      profileId: input.profileId,
      conversationId: input.conversationId,
    };
    const result = await application.getLastResponse(request);
    return {
      content: [{ type: 'text', text: result.responseText }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversationId: result.conversationId,
        responseText: result.responseText,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export function toMcpToolError(error: unknown): CallToolResult {
  if (error instanceof WebAutomationError) {
    const message = publicMessageFor(error);
    return {
      isError: true,
      content: [{ type: 'text', text: `${error.code}: ${message}` }],
      structuredContent: {
        ok: false,
        error: {
          code: error.code,
          message,
        },
      },
    };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: 'INTERNAL_ERROR: Unexpected internal error' }],
    structuredContent: {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected internal error',
      },
    },
  };
}

function publicMessageFor(error: WebAutomationError): string {
  switch (error.code) {
    case 'INVALID_REQUEST':
      return error.message;
    case 'UNSUPPORTED_PROVIDER':
      return 'The requested provider is not supported.';
    case 'AUTH_REQUIRED':
      return 'The selected browser profile must be authenticated before this operation can run.';
    case 'PROFILE_BUSY':
      return 'The selected browser profile is already in use.';
    case 'NAVIGATION_FAILED':
      return 'Failed to open the provider page.';
    case 'TARGET_NOT_FOUND':
      return 'The provider page no longer exposes an expected interaction target.';
    case 'RESPONSE_START_TIMEOUT':
      return 'The provider did not start a response before the start timeout.';
    case 'GENERATION_STALLED':
      return 'The provider started responding but stopped making observable progress.';
    case 'GENERATION_TIMEOUT':
      return 'The provider response exceeded the absolute generation safety limit.';
    case 'EXTRACTION_FAILED':
      return 'The provider response could not be extracted reliably.';
    case 'PROVIDER_UNAVAILABLE':
      return 'The provider page is currently unavailable.';
    case 'PROVIDER_CHANGED':
      return 'The provider page behavior appears to have changed.';
    case 'CONVERSATION_NOT_FOUND':
      return 'The requested conversation could not be found.';
    case 'CONVERSATION_INCOMPLETE':
      return 'The requested conversation could not be read completely.';
    case 'CONVERSATION_TOO_LARGE':
      return 'The requested conversation is too large to return through this MCP tool.';
    case 'INPUT_PATH_NOT_ALLOWED':
      return 'The input path is outside the configured input directory or is not allowed.';
    case 'INPUT_FILE_NOT_FOUND':
      return 'The requested input file was not found.';
    case 'INPUT_FILE_TOO_LARGE':
      return 'The requested input file exceeds the configured local size limit.';
    case 'FILE_UPLOAD_FAILED':
      return 'The validated local files could not be attached to the provider.';
    case 'OUTPUT_PATH_NOT_ALLOWED':
      return 'The output path is outside the configured output directory.';
    case 'FILE_ALREADY_EXISTS':
      return 'The output file already exists. Enable overwrite or choose another path.';
    case 'FILE_WRITE_FAILED':
      return 'The provider response could not be saved to the requested file.';
  }
}
