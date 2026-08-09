import { describe, expect, it } from 'vitest';

import { ChatGptAttachmentProvider } from '../../src/providers/chatgpt-attachment-provider.js';
import type { BrowserPagePort } from '../../src/ports/browser-port.js';
import type { BrowserSessionPort } from '../../src/ports/browser-session-port.js';

describe('ChatGptAttachmentProvider', () => {
  it('opens the conversation, runs the attachment workflow, captures the handle, and closes', async () => {
    let closed = false;
    const opened: (string | undefined)[] = [];
    const sessions: BrowserSessionPort = {
      acquire: async () => ({
        page: fakePage(),
        close: async () => {
          closed = true;
        },
      }),
    };
    const provider = new ChatGptAttachmentProvider(sessions, {
      createNavigator: () => ({
        open: async (conversationId) => {
          opened.push(conversationId);
        },
        currentConversationId: () => 'conversation-files-1',
      }),
      createWorkflow: () => ({
        askWithFiles: async (prompt, filePaths) => {
          expect(prompt).toBe('analyze');
          expect(filePaths).toEqual(['/safe/a.pdf']);
          return 'done';
        },
      }),
    });

    await expect(
      provider.askWithFiles({
        profileId: 'default',
        prompt: 'analyze',
        filePaths: ['/safe/a.pdf'],
        conversationId: 'existing',
      }),
    ).resolves.toEqual({ conversationId: 'conversation-files-1', responseText: 'done' });
    expect(opened).toEqual(['existing']);
    expect(closed).toBe(true);
  });
});

function fakePage(): BrowserPagePort {
  return {
    goto: async () => undefined,
    isVisible: async () => false,
    fill: async () => undefined,
    click: async () => undefined,
    press: async () => undefined,
    textContents: async () => [],
  };
}
