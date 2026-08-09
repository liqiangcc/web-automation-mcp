import type { ConversationMessage, ConversationTranscript } from '../domain/conversation.js';

export interface ConversationTranscriptRenderer {
  render(transcript: ConversationTranscript): string;
}

export class MarkdownConversationTranscriptRenderer implements ConversationTranscriptRenderer {
  public render(transcript: ConversationTranscript): string {
    const lines: string[] = [];
    lines.push(`# ${transcript.title?.trim() || 'Conversation'}`);
    lines.push('');
    lines.push(`Conversation ID: ${transcript.conversationId}`);

    for (const message of transcript.messages) {
      lines.push('');
      lines.push(`## ${roleHeading(message)}`);
      lines.push('');
      lines.push(message.text);
    }

    lines.push('');
    return lines.join('\n');
  }
}

function roleHeading(message: ConversationMessage): string {
  switch (message.role) {
    case 'user':
      return 'User';
    case 'assistant':
      return 'Assistant';
    case 'system':
      return 'System';
    case 'other':
      return 'Other';
  }
}
