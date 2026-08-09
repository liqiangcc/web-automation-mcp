import { WebAutomationError } from '../../domain/errors.js';
import {
  newestAssistantResponseAfter,
  type AssistantResponseBaseline,
} from './assistant-responses.js';

export class ChatGptPlainTextResponseExtractor {
  public extract(responses: readonly string[], baseline: AssistantResponseBaseline): string {
    const response = newestAssistantResponseAfter(responses, baseline);
    if (response !== undefined) {
      return response;
    }

    throw new WebAutomationError(
      'EXTRACTION_FAILED',
      'No non-empty ChatGPT assistant response was found after the request baseline',
    );
  }
}
