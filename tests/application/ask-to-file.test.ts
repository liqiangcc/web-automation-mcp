import { describe, expect, it } from 'vitest';

import { AskToFileUseCase } from '../../src/application/ask-to-file.js';
import type { AskRequest, AskResult } from '../../src/domain/conversation.js';
import type { AnswerFilePort, AnswerFileWriteRequest } from '../../src/ports/answer-file-port.js';

class FakeAskUseCase {
  public request: AskRequest | undefined;

  public async execute(request: AskRequest): Promise<AskResult> {
    this.request = request;
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId ?? 'conversation-1',
      responseText: 'private full response',
    };
  }
}

class RecordingFileWriter implements AnswerFilePort {
  public request: AnswerFileWriteRequest | undefined;

  public async write(request: AnswerFileWriteRequest) {
    this.request = request;
    return {
      filePath: '/workspace/results/answer.md',
      bytesWritten: 21,
      sha256: 'answer-hash',
    };
  }
}

describe('AskToFileUseCase', () => {
  it('writes the full provider response internally and returns metadata only', async () => {
    const ask = new FakeAskUseCase();
    const files = new RecordingFileWriter();
    const useCase = new AskToFileUseCase(ask, files);

    const result = await useCase.execute({
      provider: 'chatgpt',
      profileId: 'default',
      prompt: 'create a report',
      outputPath: 'results/answer.md',
      overwrite: true,
    });

    expect(ask.request).toEqual({
      provider: 'chatgpt',
      profileId: 'default',
      prompt: 'create a report',
    });
    expect(files.request).toEqual({
      outputPath: 'results/answer.md',
      content: 'private full response',
      overwrite: true,
    });
    expect(result).toEqual({
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'conversation-1',
      filePath: '/workspace/results/answer.md',
      bytesWritten: 21,
      sha256: 'answer-hash',
    });
    expect(result).not.toHaveProperty('responseText');
  });
});
