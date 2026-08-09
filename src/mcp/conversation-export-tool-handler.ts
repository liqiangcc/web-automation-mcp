import type { CallToolResult } from '@modelcontextprotocol/server';

import type { ConversationId, ProfileId, ProviderId } from '../domain/conversation.js';
import type {
  ConversationExportApplicationPort,
  ExportConversationRequest,
} from '../ports/conversation-export-port.js';
import { toMcpToolError } from './tool-handlers.js';

export interface WebExportConversationToFileToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
  readonly outputPath: string;
  readonly overwrite?: boolean;
}

export async function handleWebExportConversationToFile(
  input: WebExportConversationToFileToolInput,
  application: Partial<ConversationExportApplicationPort>,
): Promise<CallToolResult> {
  try {
    const exportConversationToFile = application.exportConversationToFile;
    if (exportConversationToFile === undefined) {
      throw new Error('Conversation export application capability is not configured.');
    }
    const request: ExportConversationRequest = {
      provider: input.provider,
      profileId: input.profileId,
      conversationId: input.conversationId,
      outputPath: input.outputPath,
      overwrite: input.overwrite ?? false,
    };
    const result = await exportConversationToFile.call(application, request);
    return {
      content: [
        {
          type: 'text',
          text: `Saved conversation transcript to ${result.filePath} (${result.messageCount} messages, ${result.bytesWritten} bytes).`,
        },
      ],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversationId: result.conversationId,
        filePath: result.filePath,
        messageCount: result.messageCount,
        bytesWritten: result.bytesWritten,
        sha256: result.sha256,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}
