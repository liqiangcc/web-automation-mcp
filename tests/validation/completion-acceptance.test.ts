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

interface FakeFastCompletion {
  readonly path: 'fast' | 'fallback';
  readonly latencyMs: number;
}

class FakeCompletionApplication implements AutomationApplicationPort {
  private fastIndex = 0;

  public constructor(
    private readonly longWaitMs: number,
    private readonly fastCompletions: readonly FakeFastCompletion[] = Array.from(
      { length: 5 },
      () => ({ path: 'fast' as const, latencyMs: 420 }),
    ),
  ) {}

  public async ask(request: AskRequest): Promise<AskResult> {
    const isLong = request.prompt.includes('4,500 words');
    const marker = request.prompt.match(/WEB_AUTOMATION_COMPLETION_[A-Z]+::[A-Z0-9_]+/i)?.[0] ?? '';
    const fastCompletion = this.fastCompletions[this.fastIndex] ?? {
      path: 'fast' as const,
      latencyMs: 420,
    };
    if (!isLong) {
      this.fastIndex += 1;
    }

    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: 'conversation-1',
      responseText: `validation response\n${marker}`,
      completion: isLong
        ? {
            path: 'fast',
            waitMs: this.longWaitMs,
            latencyMs: 420,
          }
        : {
            path: fastCompletion.path,
            waitMs: 3_000,
            latencyMs: fastCompletion.latencyMs,
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

  it('allows the configured 80 percent fast-path gate without fallback latency poisoning fast p95', async () => {
    let clock = 0;
    const report = await runCompletionAcceptance(
      new FakeCompletionApplication(130_000, [
        { path: 'fast', latencyMs: 400 },
        { path: 'fast', latencyMs: 410 },
        { path: 'fast', latencyMs: 420 },
        { path: 'fast', latencyMs: 430 },
        { path: 'fallback', latencyMs: 1_500 },
      ]),
      {
        profileId: 'default',
        skipLong: true,
        now: () => (clock += 100),
      },
    );

    expect(report.passed).toBe(true);
    expect(report.fast.summary).toMatchObject({
      requested: 5,
      passedSamples: 4,
      fastSamples: 4,
      fallbackSamples: 1,
      latencySamples: 4,
      p95LatencyMs: 430,
      maxLatencyMs: 430,
      requiredFastSamples: 4,
      passed: true,
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
