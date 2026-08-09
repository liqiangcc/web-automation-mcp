import type { ConversationId, ProfileId, ProviderId } from '../domain/conversation.js';

export interface ExportConversationRequest {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
  readonly outputPath: string;
  readonly overwrite?: boolean;
}

export interface ExportConversationResult {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
  readonly filePath: string;
  readonly messageCount: number;
  readonly bytesWritten: number;
  readonly sha256: string;
}

export interface ConversationExportApplicationPort {
  exportConversationToFile(request: ExportConversationRequest): Promise<ExportConversationResult>;
}
