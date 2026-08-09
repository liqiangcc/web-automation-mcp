import { describe, expect, it } from 'vitest';

import { ChatGptPlainTextResponseExtractor } from '../../../src/adapters/chatgpt/response-extractor.js';

describe('ChatGptPlainTextResponseExtractor', () => {
  it('extracts the newest non-empty response after the baseline', () => {
    const extractor = new ChatGptPlainTextResponseExtractor();

    expect(extractor.extract(['old', 'first new', 'final new'], { count: 1 })).toBe(
      'final new',
    );
  });

  it('fails when only pre-existing or empty response content exists', () => {
    const extractor = new ChatGptPlainTextResponseExtractor();

    expect(() => extractor.extract(['old', '   '], { count: 1 })).toThrowError(
      expect.objectContaining({ code: 'EXTRACTION_FAILED' }),
    );
  });
});
