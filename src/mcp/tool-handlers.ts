import type { ServerResult } from '@modelcontextprotocol/server';

import type {
  AskRequest,
  AskToFileRequest,
  AskWithFilesRequest,
  ConversationRequest,
  LastResponseRequest,
  SessionStatusRequest,
} from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';
import type { AttachmentApplicationPort } from '../ports/attachment-application-port.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';

export type ToolApplication = AutomationApplicationPort & Partial<AttachmentApplicationPort>;

export async function handleWebSessionStatus(
  application: ToolApplication,
  request: SessionStatusRequest,
): Promise<ServerResult> {
  return handle(async () => {
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
  });
}

export async function handleWebNewChat(
  application: ToolApplication,
  request: ConversationRequest,
): Promise<ServerResult> {
  return handle(async () => {
    const result = await application.newChat(request);
    return {
      content: [{ type: 'text', text: result.status }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversationId: result.conversationId,
        status: result.status,
      },
    };
  });
}

export async function handleWebAsk(
  application: ToolApplication,
  request: AskRequest,
): Promise<ServerResult> {
  return handle(async () => {
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
  });
}

export async function handleWebAskWithFiles(
  application: ToolApplication,
  request: AskWithFilesRequest,
): Promise<ServerResult> {
  return handle(async () => {
    const askWithFiles = application.askWithFiles;
    if (askWithFiles === undefined) {
      throw new WebAutomationError(
        'PROVIDER_UNAVAILABLE',
        'Attachment capability is not available in this runtime.',
      );
    }
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
  });
}

export async function handleWebAskToFile(
  application: ToolApplication,
  request: AskToFileRequest,
): Promise<ServerResult> {
  return handle(async () => {
    const result = await application.askToFile(request);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            provider: result.provider,
            profileId: result.profileId,
            conversationId: result.conversationId,
            filePath: result.filePath,
            bytesWritten: result.bytesWritten,
            sha256: result.sha256,
          }),
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
  });
}

export async function handleWebGetLastResponse(
  application: ToolApplication,
  request: LastResponseRequest,
): Promise<ServerResult> {
  return handle(async () => {
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
  });
}

async function handle(operation: () => Promise<ServerResult>): Promise<ServerResult> {
  try {
    return await operation();
  } catch (error) {
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
