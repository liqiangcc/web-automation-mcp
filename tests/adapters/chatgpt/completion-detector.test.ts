import { describe, expect, it } from 'vitest';

import {
  ChatGptCompletionDetector,
  type CompletionWakeupSource,
} from '../../../src/adapters/chatgpt/completion-detector.js';
import type {
  CompletionSnapshot,
  CompletionSnapshotSource,
} from '../../../src/adapters/chatgpt/completion-snapshot.js';

describe('ChatGptCompletionDetector', () => {
  it('uses the fast settle path after an observed generation end', async () => {
    const timeline = new Timeline([
      at(0, snapshot()),
      at(100, snapshot('H', true)),
      at(200, snapshot('Hello', true)),
      at(300, snapshot('Hello', false)),
    ]);
    const detector = createDetector(timeline, timeline, {
      fastSettleMs: 200,
      fallbackSettleMs: 400,
    });

    await expect(detector.waitForCompletion()).resolves.toMatchObject({
      text: 'Hello',
      responses: ['old', 'Hello'],
      sawGeneratingSignal: true,
      completionPath: 'fast',
      elapsedMs: 500,
    });
  });

  it('uses a longer fallback settle path when generation state was never observed', async () => {
    const timeline = new Timeline([at(0, snapshot('answer', false))]);
    const detector = createDetector(timeline, timeline, {
      fastSettleMs: 100,
      fallbackSettleMs: 300,
    });

    await expect(detector.waitForCompletion()).resolves.toMatchObject({
      text: 'answer',
      sawGeneratingSignal: false,
      completionPath: 'fallback',
      elapsedMs: 300,
    });
  });

  it('does not let unrelated DOM wakeups reset semantic idle time', async () => {
    const timeline = new Timeline(
      [at(0, snapshot('partial', true))],
      [100, 200, 250, 290],
    );
    const detector = createDetector(timeline, timeline, {
      idleTimeoutMs: 300,
      absoluteTimeoutMs: 2_000,
    });

    await expect(detector.waitForCompletion()).rejects.toMatchObject({
      code: 'GENERATION_STALLED',
    });
    expect(timeline.now).toBe(300);
  });

  it('allows a long response to exceed two minutes while semantic progress continues', async () => {
    const timeline = new Timeline([
      at(0, snapshot('part 1', true)),
      at(70_000, snapshot('part 1 part 2', true)),
      at(140_000, snapshot('part 1 part 2 part 3', true)),
      at(210_000, snapshot('complete answer', false)),
    ]);
    const detector = createDetector(timeline, timeline, {
      idleTimeoutMs: 80_000,
      absoluteTimeoutMs: 300_000,
      fastSettleMs: 200,
      watchdogIntervalMs: 10_000,
    });

    await expect(detector.waitForCompletion()).resolves.toMatchObject({
      text: 'complete answer',
      completionPath: 'fast',
      elapsedMs: 210_200,
    });
  });

  it('classifies a response that never starts separately from a generation stall', async () => {
    const timeline = new Timeline([at(0, snapshot())], [100, 200]);
    const detector = createDetector(timeline, timeline, {
      startTimeoutMs: 300,
      absoluteTimeoutMs: 2_000,
    });

    await expect(detector.waitForCompletion()).rejects.toMatchObject({
      code: 'RESPONSE_START_TIMEOUT',
    });
    expect(timeline.now).toBe(300);
  });

  it('keeps an absolute safety timeout even when progress continues', async () => {
    const timeline = new Timeline([
      at(0, snapshot('a', true)),
      at(100, snapshot('ab', true)),
      at(200, snapshot('abc', true)),
      at(300, snapshot('abcd', true)),
      at(400, snapshot('abcde', true)),
      at(500, snapshot('abcdef', true)),
    ]);
    const detector = createDetector(timeline, timeline, {
      idleTimeoutMs: 1_000,
      absoluteTimeoutMs: 450,
      watchdogIntervalMs: 1_000,
    });

    await expect(detector.waitForCompletion()).rejects.toMatchObject({
      code: 'GENERATION_TIMEOUT',
    });
    expect(timeline.now).toBe(450);
  });

  it('cancels and restarts settling when semantic response text changes', async () => {
    const timeline = new Timeline([
      at(0, snapshot('first', false)),
      at(200, snapshot('second', false)),
    ]);
    const detector = createDetector(timeline, timeline, {
      fallbackSettleMs: 300,
      absoluteTimeoutMs: 2_000,
    });

    await expect(detector.waitForCompletion()).resolves.toMatchObject({
      text: 'second',
      completionPath: 'fallback',
      elapsedMs: 500,
    });
  });
});

function createDetector(
  snapshots: CompletionSnapshotSource,
  wakeups: CompletionWakeupSource,
  options: {
    readonly startTimeoutMs?: number;
    readonly idleTimeoutMs?: number;
    readonly absoluteTimeoutMs?: number;
    readonly fastSettleMs?: number;
    readonly fallbackSettleMs?: number;
    readonly watchdogIntervalMs?: number;
  },
): ChatGptCompletionDetector {
  const timeline = snapshots as Timeline;
  return new ChatGptCompletionDetector(
    snapshots,
    wakeups,
    {
      startTimeoutMs: options.startTimeoutMs ?? 1_000,
      idleTimeoutMs: options.idleTimeoutMs ?? 1_000,
      absoluteTimeoutMs: options.absoluteTimeoutMs ?? 5_000,
      fastSettleMs: options.fastSettleMs ?? 200,
      fallbackSettleMs: options.fallbackSettleMs ?? 400,
      watchdogIntervalMs: options.watchdogIntervalMs ?? 1_000,
    },
    {
      now: () => timeline.now,
      sleep: async (delayMs) => {
        timeline.now += delayMs;
      },
    },
  );
}

interface ScheduledSnapshot {
  readonly at: number;
  readonly value: CompletionSnapshot;
}

class Timeline implements CompletionSnapshotSource, CompletionWakeupSource {
  public now = 0;
  private readonly wakeTimes: number[];

  public constructor(
    private readonly snapshots: readonly ScheduledSnapshot[],
    rawWakeTimes: readonly number[] = [],
  ) {
    this.wakeTimes = [
      ...new Set([
        ...snapshots.filter((entry) => entry.at > 0).map((entry) => entry.at),
        ...rawWakeTimes,
      ]),
    ].sort((left, right) => left - right);
  }

  public async read(): Promise<CompletionSnapshot> {
    let selected = this.snapshots[0]?.value ?? snapshot();
    for (const entry of this.snapshots) {
      if (entry.at > this.now) {
        break;
      }
      selected = entry.value;
    }
    return selected;
  }

  public async waitForChange(timeoutMs: number): Promise<'changed' | 'timeout'> {
    const nextWakeIndex = this.wakeTimes.findIndex((atMs) => atMs > this.now);
    const nextWake = nextWakeIndex < 0 ? undefined : this.wakeTimes[nextWakeIndex];
    const deadline = this.now + timeoutMs;

    if (nextWake !== undefined && nextWake <= deadline) {
      this.now = nextWake;
      return 'changed';
    }

    this.now = deadline;
    return 'timeout';
  }
}

function at(atMs: number, value: CompletionSnapshot): ScheduledSnapshot {
  return { at: atMs, value };
}

function snapshot(
  text?: string,
  generating: boolean | 'unknown' = false,
  composerReady: boolean | 'unknown' = true,
): CompletionSnapshot {
  return {
    responses: text === undefined ? ['old'] : ['old', text],
    responsePresent: text !== undefined,
    ...(text === undefined ? {} : { responseText: text }),
    generating,
    composerReady,
  };
}
