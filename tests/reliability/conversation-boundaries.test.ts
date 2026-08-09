import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { ObservedAutomationApplication } from '../../src/application/observed-application.js';
import type { DiagnosticsBundle, LifecycleEvent } from '../../src/domain/observability.js';
import type { AutomationApplicationPort } from '../../src/ports/automation-application-port.js';
import type { ConversationCatalogApplicationPort } from '../../src/ports/conversation-catalog-port.js';
import type { ConversationMutationApplicationPort } from '../../src/ports/conversation-mutation-port.js';
import type { ConversationReaderApplicationPort } from '../../src/ports/conversation-reader-port.js';
import type { DiagnosticsBundleSink, LifecycleSink } from '../../src/ports/observability-port.js';

const providerSemanticTokens = [
  'data-message-author-role',
  'a[href^="/c/"]',
  'conversation-delete-action',
  'conversation-delete-confirm',
];

describe('conversation architecture boundaries', () => {
  it('keeps ChatGPT selectors out of application and MCP conversation orchestration', async () => {
    const sources = await Promise.all(
      [
        '../../src/application/list-conversations.ts',
        '../../src/application/get-conversation.ts',
        '../../src/application/export-conversation.ts',
        '../../src/application/delete-conversation.ts',
        '../../src/mcp/create-server.ts',
        '../../src/mcp/tool-handlers.ts',
        '../../src/mcp/conversation-export-tool-handler.ts',
        '../../src/mcp/conversation-delete-tool-handler.ts',
      ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
    );

    for (const source of sources) {
      expect(source).not.toMatch(/from ['"]playwright(?:\/|['"])/);
      expect(source).not.toMatch(/from ['"]node:fs(?:\/|['"])/);
      for (const token of providerSemanticTokens) {
        expect(source).not.toContain(token);
      }
    }
  });

  it('keeps browser mechanics free of conversation and ChatGPT semantics', async () => {
    const source = await readFile(
      new URL('../../src/adapters/playwright/playwright-browser.ts', import.meta.url),
      'utf8',
    );

    expect(source).not.toContain('conversationId');
    expect(source).not.toContain('conversation-delete-action');
    expect(source).not.toContain('data-message-author-role');
    expect(source).not.toContain('/c/');
  });

  it('keeps ChatGPT conversation adapters independent from MCP, application and Playwright', async () => {
    const sources = await Promise.all(
      [
        '../../src/adapters/chatgpt/conversation-catalog.ts',
        '../../src/adapters/chatgpt/conversation-reader.ts',
        '../../src/adapters/chatgpt/conversation-mutation.ts',
      ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')),
    );

    for (const source of sources) {
      expect(source).not.toContain('@modelcontextprotocol/');
      expect(source).not.toMatch(/from ['"]playwright(?:\/|['"])/);
      expect(source).not.toMatch(/from ['"].*\/application\//);
      expect(source).not.toMatch(/from ['"].*\/mcp\//);
      expect(source).not.toMatch(/from ['"].*\/session\//);
    }
  });
});

describe('conversation observability redaction', () => {
  it('records only operation metadata for list/read/delete and never conversation content or raw ids', async () => {
    const lifecycle = new RecordingLifecycleSink();
    const diagnostics = new RecordingDiagnosticsSink();
    const secrets = {
      conversationId: 'CONVERSATION_ID_SECRET_123',
      title: 'CONVERSATION_TITLE_SECRET_456',
      body: 'CONVERSATION_BODY_SECRET_789',
    };

    const inner: AutomationApplicationPort &
      ConversationCatalogApplicationPort &
      ConversationReaderApplicationPort &
      ConversationMutationApplicationPort = {
      ask: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: request.conversationId ?? 'unused',
        responseText: 'unused',
      }),
      askToFile: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: request.conversationId ?? 'unused',
        filePath: request.outputPath,
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
      listConversations: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversations: [
          {
            conversationId: secrets.conversationId,
            title: secrets.title,
          },
        ],
      }),
      getConversation: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: request.conversationId,
        messages: [{ role: 'assistant', text: secrets.body }],
      }),
      deleteConversation: async (request) => ({
        provider: request.provider,
        profileId: request.profileId,
        conversationId: request.conversationId,
        deleted: true,
      }),
    };

    const application = new ObservedAutomationApplication(inner, {
      lifecycle,
      diagnostics,
      createRequestId: () => 'safe-request-id',
    });

    await application.listConversations({
      provider: 'chatgpt',
      profileId: 'default',
      limit: 20,
    });
    await application.getConversation({
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: secrets.conversationId,
    });
    await application.deleteConversation({
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: secrets.conversationId,
    });

    const serialized = JSON.stringify({
      lifecycle: lifecycle.events,
      diagnostics: diagnostics.bundles,
    });
    expect(serialized).not.toContain(secrets.conversationId);
    expect(serialized).not.toContain(secrets.title);
    expect(serialized).not.toContain(secrets.body);
    expect(serialized).toContain('list_conversations');
    expect(serialized).toContain('get_conversation');
    expect(serialized).toContain('delete_conversation');
    expect(serialized).toContain('"hasConversationId":true');
  });
});

class RecordingLifecycleSink implements LifecycleSink {
  public readonly events: LifecycleEvent[] = [];

  public async record(event: LifecycleEvent): Promise<void> {
    this.events.push(event);
  }
}

class RecordingDiagnosticsSink implements DiagnosticsBundleSink {
  public readonly bundles: DiagnosticsBundle[] = [];

  public async write(bundle: DiagnosticsBundle): Promise<void> {
    this.bundles.push(bundle);
  }
}
