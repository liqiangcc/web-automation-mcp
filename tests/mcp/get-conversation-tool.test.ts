import { describe, expect, it } from 'vitest';

import { handleWebGetConversation } from '../../src/mcp/tool-handlers.js';
import type { ConversationReaderApplicationPort } from '../../src/ports/conversation-reader-port.js';

const application: ConversationReaderApplicationPort = {
  async getConversation(request) {
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      messages: [
        { role: 'user', text: 'Question' },
        { role: 'assistant', text: 'Answer' },
      ],
    };
  },
};

describe('web_get_conversation handler', () => {
  it('returns ordered semantic transcript messages', async () => {
    const result = await handleWebGetConversation(
      { provider: 'chatgpt', profileId: 'default', conversationId: 'c1' },
      application,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      ok: true,
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'c1',
      messages: [
        { role: 'user', text: 'Question' },
        { role: 'assistant', text: 'Answer' },
      ],
    });
  });
});
