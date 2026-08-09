import type { ConversationId, ProfileId, ProviderId } from '../domain/conversation.js';
import type { ResponseCompletionMetadata } from '../domain/execution.js';

export interface ProviderAskWithFilesInput {
  readonly profileId: ProfileId;
  readonly prompt: string;
  readonly filePaths: readonly string[];
  readonly conversationId?: ConversationId;
}

export interface ProviderAskWithFilesOutput {
  readonly conversationId: ConversationId;
  readonly responseText: string;
  readonly completion?: ResponseCompletionMetadata;
}

export interface ProviderAttachmentPort {
  readonly id: ProviderId;
  askWithFiles(input: ProviderAskWithFilesInput): Promise<ProviderAskWithFilesOutput>;
}
