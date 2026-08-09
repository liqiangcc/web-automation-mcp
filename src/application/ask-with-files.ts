import type {
  AskWithFilesRequest,
  AskWithFilesResult,
  ProviderId,
} from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';
import type { InputFilePort } from '../ports/input-file-port.js';
import type { ProviderAttachmentPort } from '../ports/provider-attachment-port.js';

export class AskWithFilesUseCase {
  public constructor(
    private readonly providers: ReadonlyMap<ProviderId, ProviderAttachmentPort>,
    private readonly inputFiles: InputFilePort,
  ) {}

  public async execute(request: AskWithFilesRequest): Promise<AskWithFilesResult> {
    const prompt = request.prompt.trim();
    if (prompt.length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'Prompt must not be empty.');
    }
    if (request.files.length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'At least one input file is required.');
    }

    const provider = this.providers.get(request.provider);
    if (provider === undefined) {
      throw new WebAutomationError(
        'UNSUPPORTED_PROVIDER',
        `Provider is not registered for attachments: ${request.provider}`,
      );
    }

    const files = await this.inputFiles.resolve(request.files);
    const result = await provider.askWithFiles({
      profileId: request.profileId,
      prompt,
      filePaths: files.map((file) => file.filePath),
      ...(request.conversationId === undefined
        ? {}
        : { conversationId: request.conversationId }),
    });

    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: result.conversationId,
      responseText: result.responseText,
      fileCount: files.length,
      ...(result.completion === undefined ? {} : { completion: result.completion }),
    };
  }
}
