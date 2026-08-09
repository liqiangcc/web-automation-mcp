import type { CallToolResult } from '@modelcontextprotocol/server';

import type { ConversationId, ProfileId, ProviderId } from '../domain/conversation.js';
import type {
  ConversationMutationApplicationPort,
  DeleteConversationRequest,
} from '../ports/conversation-mutation-port.js';
import { toMcpToolError } from './tool-handlers.js';

export interface WebDeleteConversationToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
}

export async function handleWebDeleteConversation(
  input: WebDeleteConversationToolInput,
  application: Partial<ConversationMutationApplicationPort>,
): Promise<CallToolResult> {
  try {
    const deleteConversation = application.deleteConversation;
    if (deleteConversation === undefined) {
      throw new Error('Conversation mutation application capability is not configured.');
    }

    const request: DeleteConversationRequest = {
      provider: input.provider,
      profileId: input.profileId,
      conversationId: input.conversationId,
    };
    const result = await deleteConversation.call(application, request);
    return {
      content: [
        {
          type: 'text',
          text: `Deleted conversation ${result.conversationId}.`,
        },
      ],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversationId: result.conversationId,
        deleted: result.deleted,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}
