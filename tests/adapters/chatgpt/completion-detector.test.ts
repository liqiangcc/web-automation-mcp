import { describe, expect, it } from 'vitest';

import {
  ChatGptCompletionDetector,
  type GenerationStatusSource,
} from '../../../src/adapters/chatgpt/completion-detector.js';
import type { AssistantResponseSource } from '../../../src/adapters/chatgpt/assistant-responses.js';

describe('ChatGptCompletionDetector', () => {
  it('waits for a new response to stop streaming and remain stable', async () => {
    const clock = new FakeClock();
    const responses = new SequenceResponses([
      ['old'],
      ['old', 'H'],
      ['old', 'Hello'],
      ['old', 'Hello'],
      ['old', 'Hello'],
      ['old', 'Hello'],
    ]);
    const generation = new SequenceGeneration([false, true, true, false, false, false]);
    const detector = createDetector(responses, generation, clock, {
      stableWindowMs: 200,
      noSignalStableWindowMs: 400,
    });

    await expect(detector.waitForCompletion({ count: 1 })).resolves.toMatchObject({
      text: 'Hello',
      responses: ['old', 'Hello'],
      sawGeneratingSignal: true,
      elapsedMs: 500,
    });
  });

  it('uses a longer stability window when no generating signal is observed', async () => {
    const clock = new FakeClock();
    const responses = new SequenceResponses([
      ['old', 'answer'],
      ['old', 'answer'],
      ['old', 'answer'],
      ['old', 'answer'],
    ]);
    const generation = new SequenceGeneration([false]);
    const detector = createDetector(responses, generation, clock, {
      stableWindowMs: 100,
      noSignalStableWindowMs: 300,
    });

    await expect(detector.waitForCompletion({ count: 1 })).resolves.toMatchObject({
      text: 'answer',
      sawGeneratingSignal: false,
      elapsedMs: 300,
    });
  });

  it('does not mistake the pre-existing assistant response for a new answer', async () => {
    const clock = new FakeClock();
    const detector = createDetector(
      new SequenceResponses([['old']]),
      new SequenceGeneration([false]),
      clock,
      { timeoutMs: 300 },
    );

    await expect(detector.waitForCompletion({ count: 1 })).rejects.toMatchObject({
      code: 'GENERATION_TIMEOUT',
    });
  });
});

function createDetector(
  responses: AssistantResponseSource,
  generation: GenerationStatusSource,
  clock: FakeClock,
  options: {
    readonly timeoutMs?: number;
    readonly stableWindowMs?: number;
    readonly noSignalStableWindowMs?: number;
  },
): ChatGptCompletionDetector {
  return new ChatGptCompletionDetector(
    responses,
    generation,
    {
      timeoutMs: options.timeoutMs ?? 2_000,
      pollIntervalMs: 100,
      stableWindowMs: options.stableWindowMs ?? 200,
      noSignalStableWindowMs: options.noSignalStableWindowMs ?? 400,
    },
    {
      now: () => clock.now,
      sleep: async (delayMs) => {
        clock.now += delayMs;
      },
    },
  );
}

class FakeClock {
  public now = 0;
}

class SequenceResponses implements AssistantResponseSource {
  private index = 0;

  public constructor(private readonly values: readonly (readonly string[])[]) {}

  public async read(): Promise<readonly string[]> {
    const value = this.values[Math.min(this.index, this.values.length - 1)] ?? [];
    this.index += 1;
    return value;
  }
}

class SequenceGeneration implements GenerationStatusSource {
  private index = 0;

  public constructor(private readonly values: readonly boolean[]) {}

  public async isGenerating(): Promise<boolean> {
    const value = this.values[Math.min(this.index, this.values.length - 1)] ?? false;
    this.index += 1;
    return value;
  }
}
