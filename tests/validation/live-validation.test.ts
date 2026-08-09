import { describe, expect, it } from 'vitest';

import type {
  AskRequest,
  AskResult,
  AskToFileRequest,
  AskToFileResult,
  AskWithFilesRequest,
  AskWithFilesResult,
} from '../../src/domain/conversation.js';
import type { AttachmentApplicationPort } from '../../src/ports/attachment-application-port.js';
import type {
  AutomationApplicationPort,
  LastResponseRequest,
  NewChatRequest,
  SessionStatusRequest,
} from '../../src/ports/automation-application-port.js';
import {
  buildValidationMatrix,
  runAttachmentValidation,
  runLiveValidation,
} from '../../src/validation/live-validation.js';

class FakeLiveApplication implements AutomationApplicationPort, AttachmentApplicationPort {
  public askRequests: AskRequest[] = [];

  public async ask(request: AskRequest): Promise<AskResult> {
    this.askRequests.push(request);
    const marker = request.prompt.match(/WEB_AUTOMATION_VALIDATION_END::[a-z0-9_]+/i)?.[0] ?? '';
    return {
      provider: 'chatgpt',
      profileId: request.profileId,
      conversationId: request.conversationId ?? `conversation-${this.askRequests.length}`,
      responseText: `validation response\n${marker}`,
    };
  }

  public async askWithFiles(request: AskWithFilesRequest): Promise<AskWithFilesResult> {
    const marker = request.prompt.match(/WEB_AUTOMATION_VALIDATION_END::[a-z0-9_]+/i)?.[0] ?? '';
    return {
      provider: 'chatgpt',
      profileId: request.profileId,
      conversationId: 'attachment-conversation',
      responseText: `ALPHA-7429 BETA-3141\n${marker}`,
      fileCount: request.files.length,
    };
  }

  public async askToFile(request: AskToFileRequest): Promise<AskToFileResult> {
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: 'unused',
      filePath: request.outputPath,
      bytesWritten: 0,
      sha256: '',
    };
  }

  public async sessionStatus(request: SessionStatusRequest) {
    return {
      provider: request.provider,
      profileId: request.profileId,
      status: 'AUTHENTICATED' as const,
    };
  }

  public async newChat(request: NewChatRequest) {
    return { provider: request.provider, profileId: request.profileId, status: 'READY' as const };
  }

  public async getLastResponse(request: LastResponseRequest) {
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      responseText: 'unused',
    };
  }
}

describe('live validation', () => {
  it('builds exactly 30 cases with five requests in each reliability category', () => {
    const matrix = buildValidationMatrix();
    expect(matrix).toHaveLength(30);

    const counts = new Map<string, number>();
    for (const validationCase of matrix) {
      counts.set(validationCase.category, (counts.get(validationCase.category) ?? 0) + 1);
    }

    expect(Object.fromEntries(counts)).toEqual({
      short: 5,
      long: 5,
      code: 5,
      multi_turn: 5,
      slow: 5,
      repeated_new_chat: 5,
    });
  });

  it('counts a request as successful only when the unique end marker is present', async () => {
    const application = new FakeLiveApplication();
    let clock = 0;
    const report = await runLiveValidation(application, {
      profileId: 'default',
      delayMs: 0,
      now: () => {
        clock += 100;
        return clock;
      },
      sleep: async () => undefined,
    });

    expect(report.summary).toMatchObject({
      requested: 30,
      attempted: 30,
      succeeded: 30,
      incomplete: 0,
      failed: 0,
      passed: true,
    });
    expect(application.askRequests).toHaveLength(30);
    expect(
      report.results.filter(
        (result) => result.category === 'multi_turn' && result.conversationContinued,
      ),
    ).toHaveLength(4);
  });

  it('validates attachment count, expected tokens, and completion marker', async () => {
    const application = new FakeLiveApplication();
    const results = await runAttachmentValidation(application, 'default', [
      {
        id: 'multi',
        files: ['a.txt', 'b.md'],
        prompt: 'read both',
        expectedText: ['ALPHA-7429', 'BETA-3141'],
      },
    ]);

    expect(results).toEqual([
      expect.objectContaining({
        id: 'multi',
        status: 'SUCCESS',
        fileCount: 2,
      }),
    ]);
  });
});
