import { describe, expect, it } from 'vitest';

import { handleWebListConversations } from '../../src/mcp/tool-handlers.js';
import type { ConversationCatalogApplicationPort } from '../../src/ports/conversation-catalog-port.js';

const application: ConversationCatalogApplicationPort = {
  async listConversations(request) {
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversations: [{ conversationId: 'c1', title: 'Conversation one' }],
      nextCursor: 'next-1',
    };
  },
};

describe('web_list_conversations handler', () => {
  it('returns lightweight conversation metadata and cursor', async () => {
    const result = await handleWebListConversations(
      { provider: 'chatgpt', profileId: 'default', limit: 20 },
      application,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      ok: true,
      provider: 'chatgpt',
      profileId: 'default',
      conversations: [{ conversationId: 'c1', title: 'Conversation one' }],
      nextCursor: 'next-1',
    });
  });
});
