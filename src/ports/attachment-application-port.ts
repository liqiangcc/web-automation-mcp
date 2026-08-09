import type { AskWithFilesRequest, AskWithFilesResult } from '../domain/conversation.js';

export interface AttachmentApplicationPort {
  askWithFiles(request: AskWithFilesRequest): Promise<AskWithFilesResult>;
}
