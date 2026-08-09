import { describe, expect, it } from 'vitest';

import { WebAutomationError } from '../../src/domain/errors.js';
import { handleWebDeleteConversation } from '../../src/mcp/conversation-delete-tool-handler.js';
import type { ConversationMutationApplicationPort } from '../../src/ports/conversation-mutation-port.js';

describe('web_delete_conversation handler', () => {
  it('returns only the explicit deletion result', async () => {
    const application: ConversationMutationApplicationPort = {
      async deleteConversation(request) {
        return {
          provider: request.provider,
          profileId: request.profileId,
          conversationId: request.conversationId,
          deleted: true,
        };
      },
    };

    const result = await handleWebDeleteConversation(
      {
        provider: 'chatgpt',
        profileId: 'default',
        conversationId: 'target-id',
      },
      application,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      ok: true,
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'target-id',
      deleted: true,
    });
  });

  it('redacts provider-specific delete failure details', async () => {
    const application: ConversationMutationApplicationPort = {
      async deleteConversation() {
        throw new WebAutomationError(
          'CONVERSATION_DELETE_FAILED',
          'secret selector [data-private="value"] failed',
        );
      },
    };

    const result = await handleWebDeleteConversation(
      {
        provider: 'chatgpt',
        profileId: 'default',
        conversationId: 'target-id',
      },
      application,
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain('CONVERSATION_DELETE_FAILED');
    expect(JSON.stringify(result)).not.toContain('data-private');
    expect(JSON.stringify(result)).not.toContain('secret selector');
  });
});
