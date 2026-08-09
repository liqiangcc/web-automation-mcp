import type { ResponseCompletionMetadata } from './execution.js';

export type ProviderId = 'chatgpt';
export type ProfileId = string;
export type ConversationId = string;
export type ConversationCursor = string;
export type ConversationMessageRole = 'user' | 'assistant' | 'system' | 'other';

export interface ConversationSummary {
  readonly conversationId: ConversationId;
  readonly title: string;
}

export interface ConversationPage {
  readonly conversations: readonly ConversationSummary[];
  readonly nextCursor?: ConversationCursor;
}

export interface ConversationMessage {
  readonly role: ConversationMessageRole;
  readonly text: string;
}

export interface ConversationTranscript {
  readonly conversationId: ConversationId;
  readonly title?: string;
  readonly messages: readonly ConversationMessage[];
}

export interface AskRequest {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly prompt: string;
  readonly conversationId?: ConversationId;
}

export interface AskResult {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
  readonly responseText: string;
  readonly completion?: ResponseCompletionMetadata;
}

export interface AskWithFilesRequest extends AskRequest {
  readonly files: readonly string[];
}

export interface AskWithFilesResult extends AskResult {
  readonly fileCount: number;
}

export interface AskToFileRequest extends AskRequest {
  readonly outputPath: string;
  readonly overwrite?: boolean;
}

export interface AskToFileResult {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
  readonly filePath: string;
  readonly bytesWritten: number;
  readonly sha256: string;
  readonly completion?: ResponseCompletionMetadata;
}
