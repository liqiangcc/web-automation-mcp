import { WebAutomationError } from '../domain/errors.js';
import type { AnswerFilePort } from '../ports/answer-file-port.js';
import type {
  ConversationExportApplicationPort,
  ExportConversationRequest,
  ExportConversationResult,
} from '../ports/conversation-export-port.js';
import type { ConversationReaderPort } from '../ports/conversation-reader-port.js';
import {
  MarkdownConversationTranscriptRenderer,
  type ConversationTranscriptRenderer,
} from './conversation-transcript-renderer.js';

export class ExportConversationUseCase implements ConversationExportApplicationPort {
  public constructor(
    private readonly readers: ReadonlyMap<string, ConversationReaderPort>,
    private readonly files: AnswerFilePort,
    private readonly renderer: ConversationTranscriptRenderer =
      new MarkdownConversationTranscriptRenderer(),
  ) {}

  public async exportConversationToFile(
    request: ExportConversationRequest,
  ): Promise<ExportConversationResult> {
    if (request.conversationId.trim().length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'conversationId must not be empty.');
    }
    if (request.outputPath.trim().length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'outputPath must not be empty.');
    }

    const reader = this.readers.get(request.provider);
    if (reader === undefined) {
      throw new WebAutomationError(
        'UNSUPPORTED_PROVIDER',
        `No conversation reader is configured for provider ${request.provider}.`,
      );
    }

    const transcript = await reader.get({
      profileId: request.profileId,
      conversationId: request.conversationId,
    });
    const content = this.renderer.render(transcript);
    const file = await this.files.write({
      outputPath: request.outputPath,
      content,
      overwrite: request.overwrite ?? false,
    });

    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: transcript.conversationId,
      filePath: file.filePath,
      messageCount: transcript.messages.length,
      bytesWritten: file.bytesWritten,
      sha256: file.sha256,
    };
  }
}
