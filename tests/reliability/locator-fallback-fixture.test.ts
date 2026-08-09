import { describe, expect, it } from 'vitest';

import { ChatGptAssistantResponseReader } from '../../src/adapters/chatgpt/assistant-responses.js';
import { ChatGptPromptSubmitter } from '../../src/adapters/chatgpt/prompt-submit.js';
import { CHATGPT_TARGETS } from '../../src/adapters/chatgpt/targets.js';
import {
  SelectorDriftFixturePage,
  locatorKey,
} from '../fixtures/chatgpt-selector-drift.js';

describe('ChatGPT selector drift fixture', () => {
  it('survives primary input, submit, and response selector drift using ordered fallbacks', async () => {
    const primaryInput = requiredCandidate('prompt-input', 0);
    const fallbackInput = requiredCandidate('prompt-input', 1);
    const primarySubmit = requiredCandidate('prompt-submit', 0);
    const fallbackSubmit = requiredCandidate('prompt-submit', 1);
    const primaryResponse = requiredCandidate('assistant-response', 0);
    const fallbackResponse = requiredCandidate('assistant-response', 1);

    const page = new SelectorDriftFixturePage({
      failingCandidates: [primaryInput, primaryResponse],
      visibleCandidates: [fallbackInput, fallbackSubmit, fallbackResponse],
      textByCandidate: new Map([[locatorKey(fallbackResponse), ['fallback answer']]]),
    });

    const submit = await new ChatGptPromptSubmitter(page).submit('selector drift prompt');
    const responses = await new ChatGptAssistantResponseReader(page).read();

    expect(submit).toMatchObject({
      method: 'click',
      inputTarget: fallbackInput,
      submitTarget: fallbackSubmit,
    });
    expect(page.filled).toEqual([{ locator: fallbackInput, value: 'selector drift prompt' }]);
    expect(page.clicked).toEqual([fallbackSubmit]);
    expect(responses).toEqual(['fallback answer']);

    expect(page.inspected).toContainEqual(primaryInput);
    expect(page.inspected).toContainEqual(fallbackInput);
    expect(page.inspected).toContainEqual(primarySubmit);
    expect(page.inspected).toContainEqual(fallbackSubmit);
    expect(page.inspected).toContainEqual(primaryResponse);
    expect(page.inspected).toContainEqual(fallbackResponse);
  });
});

function requiredCandidate(target: keyof typeof CHATGPT_TARGETS, index: number) {
  const candidate = CHATGPT_TARGETS[target][index];
  if (candidate === undefined) {
    throw new Error(`Missing test candidate ${target}[${index}]`);
  }
  return candidate;
}
