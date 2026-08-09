import { WebAutomationError } from '../domain/errors.js';
import type {
  ConversationReaderApplicationPort,
  ConversationReaderPort,
  GetConversationRequest,
  GetConversationResult,
} from '../ports/conversation-reader-port.js';

const DEFAULT_MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;

export class GetConversationUseCase implements ConversationReaderApplicationPort {
  public constructor(
    private readonly readers: ReadonlyMap<string, ConversationReaderPort>,
    private readonly maxTranscriptBytes = DEFAULT_MAX_TRANSCRIPT_BYTES,
  ) {
    if (!Number.isInteger(maxTranscriptBytes) || maxTranscriptBytes <= 0) {
      throw new WebAutomationError(
        'INVALID_REQUEST',
        'maxTranscriptBytes must be a positive integer.',
      );
    }
  }

  public async getConversation(request: GetConversationRequest): Promise<GetConversationResult> {
    if (request.conversationId.trim().length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'conversationId must not be empty.');
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
    const bytes = transcriptBytes(transcript.messages);
    if (bytes > this.maxTranscriptBytes) {
      throw new WebAutomationError(
        'CONVERSATION_TOO_LARGE',
        `Conversation transcript exceeds the ${this.maxTranscriptBytes}-byte MCP response limit.`,
      );
    }

    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: transcript.conversationId,
      ...(transcript.title === undefined ? {} : { title: transcript.title }),
      messages: transcript.messages,
    };
  }
}

function transcriptBytes(messages: readonly { readonly role: string; readonly text: string }[]): number {
  const encoder = new TextEncoder();
  return messages.reduce(
    (total, message) => total + encoder.encode(`${message.role}\n${message.text}\n`).byteLength,
    0,
  );
}
