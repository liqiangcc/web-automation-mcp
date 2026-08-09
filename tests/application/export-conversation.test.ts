import { describe, expect, it } from 'vitest';

import { ExportConversationUseCase } from '../../src/application/export-conversation.js';
import { MarkdownConversationTranscriptRenderer } from '../../src/application/conversation-transcript-renderer.js';
import type { AnswerFilePort } from '../../src/ports/answer-file-port.js';
import type { ConversationReaderPort } from '../../src/ports/conversation-reader-port.js';

class FakeReader implements ConversationReaderPort {
  public readonly id = 'chatgpt' as const;

  public async get() {
    return {
      conversationId: 'c1',
      title: 'Architecture',
      messages: [
        { role: 'user' as const, text: 'Question' },
        { role: 'assistant' as const, text: 'Answer' },
      ],
    };
  }
}

class CapturingFileWriter implements AnswerFilePort {
  public request:
    | { readonly outputPath: string; readonly content: string; readonly overwrite: boolean }
    | undefined;

  public async write(request: {
    readonly outputPath: string;
    readonly content: string;
    readonly overwrite: boolean;
  }) {
    this.request = request;
    return {
      filePath: request.outputPath,
      bytesWritten: new TextEncoder().encode(request.content).byteLength,
      sha256: 'abc123',
    };
  }
}

describe('conversation export', () => {
  it('renders deterministic Markdown and returns only file metadata', async () => {
    const files = new CapturingFileWriter();
    const useCase = new ExportConversationUseCase(
      new Map([['chatgpt', new FakeReader()]]),
      files,
    );

    const result = await useCase.exportConversationToFile({
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'c1',
      outputPath: 'conversations/c1.md',
    });

    expect(files.request).toEqual({
      outputPath: 'conversations/c1.md',
      overwrite: false,
      content:
        '# Architecture\n\nConversation ID: c1\n\n## User\n\nQuestion\n\n## Assistant\n\nAnswer\n',
    });
    expect(result).toEqual({
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'c1',
      filePath: 'conversations/c1.md',
      messageCount: 2,
      bytesWritten: files.request === undefined ? 0 : new TextEncoder().encode(files.request.content).byteLength,
      sha256: 'abc123',
    });
  });

  it('uses a stable generic heading when no title is available', () => {
    const rendered = new MarkdownConversationTranscriptRenderer().render({
      conversationId: 'c2',
      messages: [{ role: 'system', text: 'System message' }],
    });

    expect(rendered).toBe(
      '# Conversation\n\nConversation ID: c2\n\n## System\n\nSystem message\n',
    );
  });
});
