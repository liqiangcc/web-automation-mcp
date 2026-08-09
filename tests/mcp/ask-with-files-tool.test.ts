import { describe, expect, it } from 'vitest';

import { handleWebAskWithFiles } from '../../src/mcp/tool-handlers.js';
import type { AttachmentApplicationPort } from '../../src/ports/attachment-application-port.js';
import type { AutomationApplicationPort } from '../../src/ports/automation-application-port.js';

describe('web_ask_with_files handler', () => {
  it('returns the response and file count without returning local canonical paths', async () => {
    const application: AutomationApplicationPort & AttachmentApplicationPort = {
      ask: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: 'unused',
        responseText: 'unused',
      }),
      askWithFiles: async (request) => {
        expect(request.files).toEqual(['docs/a.pdf']);
        return {
          provider: request.provider,
          profileId: request.profileId,
          conversationId: 'conversation-files-1',
          responseText: 'file analysis',
          fileCount: 1,
        };
      },
      askToFile: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: 'unused',
        filePath: '/output/unused',
        bytesWritten: 0,
        sha256: 'unused',
      }),
      sessionStatus: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        status: 'AUTHENTICATED',
      }),
      newChat: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        status: 'READY',
      }),
      getLastResponse: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: request.conversationId,
        responseText: 'unused',
      }),
    };

    const result = await handleWebAskWithFiles(
      {
        provider: 'chatgpt',
        profileId: 'default',
        prompt: 'analyze',
        files: ['docs/a.pdf'],
      },
      application,
    );

    expect(result.content).toEqual([{ type: 'text', text: 'file analysis' }]);
    expect(result.structuredContent).toEqual({
      ok: true,
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'conversation-files-1',
      responseText: 'file analysis',
      fileCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain('/private/');
    expect(JSON.stringify(result)).not.toContain('docs/a.pdf');
  });
});
