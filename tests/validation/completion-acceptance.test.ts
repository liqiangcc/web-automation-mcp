import { describe, expect, it } from 'vitest';

import type {
  AskRequest,
  AskResult,
  AskToFileRequest,
  AskToFileResult,
} from '../../src/domain/conversation.js';
import type {
  AutomationApplicationPort,
  LastResponseRequest,
  NewChatRequest,
  SessionStatusRequest,
} from '../../src/ports/automation-application-port.js';
import { runCompletionAcceptance } from '../../src/validation/completion-acceptance.js';

class FakeCompletionApplication implements AutomationApplicationPort {
  public constructor(private readonly longWaitMs: number) {}

  public async ask(request: AskRequest): Promise<AskResult> {
    const isLong = request.prompt.includes('4,500 words');
    const marker = request.prompt.match(/WEB_AUTOMATION_COMPLETION_[A-Z]+::[A-Z0-9_]+/i)?.[0] ?? '';
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: 'conversation-1',
      responseText: `validation response\n${marker}`,
      completion: {
        path: 'fast',
        waitMs: isLong ? this.longWaitMs : 3_000,
        latencyMs: 420,
      },
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

describe('completion acceptance', () => {
  it('passes when fast samples stay under one second and the long response exceeds two minutes', async () => {
    let clock = 0;
    const report = await runCompletionAcceptance(new FakeCompletionApplication(130_000), {
      profileId: 'default',
      now: () => (clock += 100),
    });

    expect(report.passed).toBe(true);
    expect(report.conclusive).toBe(true);
    expect(report.fast.summary).toMatchObject({
      requested: 5,
      fastSamples: 5,
      p95LatencyMs: 420,
      passed: true,
    });
    expect(report.long).toMatchObject({
      status: 'PASS',
      completionWaitMs: 130_000,
      minimumCompletionWaitMs: 120_000,
    });
  });

  it('marks the long check inconclusive when ChatGPT finishes before two minutes', async () => {
    let clock = 0;
    const report = await runCompletionAcceptance(new FakeCompletionApplication(90_000), {
      profileId: 'default',
      now: () => (clock += 100),
    });

    expect(report.passed).toBe(false);
    expect(report.conclusive).toBe(false);
    expect(report.long).toMatchObject({
      status: 'INCONCLUSIVE',
      reason: 'response_finished_before_minimum_duration',
      completionWaitMs: 90_000,
    });
  });
});
