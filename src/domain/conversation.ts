export type ProviderId = 'chatgpt';
export type ProfileId = string;
export type ConversationId = string;

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
}
