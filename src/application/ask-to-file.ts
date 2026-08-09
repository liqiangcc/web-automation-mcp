import type { AskToFileRequest, AskToFileResult } from '../domain/conversation.js';
import type { AnswerFilePort } from '../ports/answer-file-port.js';
import type { AskUseCase } from './ask.js';

export class AskToFileUseCase {
  public constructor(
    private readonly ask: Pick<AskUseCase, 'execute'>,
    private readonly files: AnswerFilePort,
  ) {}

  public async execute(request: AskToFileRequest): Promise<AskToFileResult> {
    const answer = await this.ask.execute({
      provider: request.provider,
      profileId: request.profileId,
      prompt: request.prompt,
      ...(request.conversationId === undefined ? {} : { conversationId: request.conversationId }),
    });
    const file = await this.files.write({
      outputPath: request.outputPath,
      content: answer.responseText,
      overwrite: request.overwrite ?? false,
    });

    return {
      provider: answer.provider,
      profileId: answer.profileId,
      conversationId: answer.conversationId,
      filePath: file.filePath,
      bytesWritten: file.bytesWritten,
      sha256: file.sha256,
    };
  }
}
