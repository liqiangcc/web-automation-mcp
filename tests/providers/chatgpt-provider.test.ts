import { describe, expect, it } from 'vitest';

import { ChatGptProvider } from '../../src/providers/chatgpt-provider.js';
import type { BrowserPagePort } from '../../src/ports/browser-port.js';
import type { BrowserSessionPort } from '../../src/ports/browser-session-port.js';

describe('ChatGptProvider', () => {
  it('opens the requested conversation, propagates completion metadata, captures the handle, and closes', async () => {
    const page = fakePage();
    let closed = false;
    const opened: (string | undefined)[] = [];
    const sessions: BrowserSessionPort = {
      acquire: async (provider, profileId) => {
        expect(provider).toBe('chatgpt');
        expect(profileId).toBe('default');
        return {
          page,
          close: async () => {
            closed = true;
          },
        };
      },
    };

    const provider = new ChatGptProvider(sessions, {
      createNavigator: () => ({
        open: async (conversationId) => {
          opened.push(conversationId);
        },
        currentConversationId: () => 'conversation-42',
      }),
      createWorkflow: () => ({
        ask: async () => 'world',
        askWithMetadata: async (prompt) => {
          expect(prompt).toBe('hello');
          return {
            responseText: 'world',
            completion: { path: 'fast', waitMs: 1_300, latencyMs: 400 },
          };
        },
      }),
    });

    await expect(
      provider.ask({ profileId: 'default', prompt: 'hello', conversationId: 'existing' }),
    ).resolves.toEqual({
      conversationId: 'conversation-42',
      responseText: 'world',
      completion: { path: 'fast', waitMs: 1_300, latencyMs: 400 },
    });
    expect(opened).toEqual(['existing']);
    expect(closed).toBe(true);
  });

  it('always closes the browser session when the page workflow fails', async () => {
    let closed = false;
    const provider = new ChatGptProvider(
      {
        acquire: async () => ({
          page: fakePage(),
          close: async () => {
            closed = true;
          },
        }),
      },
      {
        createNavigator: () => ({
          open: async () => undefined,
          currentConversationId: () => 'unused',
        }),
        createWorkflow: () => ({
          ask: async () => {
            throw new Error('workflow failed');
          },
        }),
      },
    );

    await expect(provider.ask({ profileId: 'default', prompt: 'hello' })).rejects.toThrow(
      'workflow failed',
    );
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
