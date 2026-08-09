import { describe, expect, it } from 'vitest';

import { handleWebExportConversationToFile } from '../../src/mcp/conversation-export-tool-handler.js';
import type { ConversationExportApplicationPort } from '../../src/ports/conversation-export-port.js';

const application: ConversationExportApplicationPort = {
  async exportConversationToFile(request) {
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      filePath: request.outputPath,
      messageCount: 42,
      bytesWritten: 1234,
      sha256: 'deadbeef',
    };
  },
};

describe('web_export_conversation_to_file handler', () => {
  it('returns file metadata without transcript content', async () => {
    const result = await handleWebExportConversationToFile(
      {
        provider: 'chatgpt',
        profileId: 'default',
        conversationId: 'c1',
        outputPath: 'conversations/c1.md',
      },
      application,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      ok: true,
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'c1',
      filePath: 'conversations/c1.md',
      messageCount: 42,
      bytesWritten: 1234,
      sha256: 'deadbeef',
    });
    expect(JSON.stringify(result)).not.toContain('Question');
    expect(JSON.stringify(result)).not.toContain('Answer');
  });
});
