import { describe, expect, it } from 'vitest';

import { WebAutomationError } from '../../src/domain/errors.js';
import {
  handleWebAsk,
  handleWebSessionStatus,
  toMcpToolError,
} from '../../src/mcp/tool-handlers.js';
import type {
  AutomationApplicationPort,
  SessionStatusRequest,
} from '../../src/ports/automation-application-port.js';
import type { AskRequest, AskResult } from '../../src/domain/conversation.js';

class FakeApplication implements AutomationApplicationPort {
  public askRequests: AskRequest[] = [];
  public statusRequests: SessionStatusRequest[] = [];

  public async ask(request: AskRequest): Promise<AskResult> {
    this.askRequests.push(request);
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId ?? 'conversation-1',
      responseText: 'final answer',
    };
  }

  public async sessionStatus(request: SessionStatusRequest) {
    this.statusRequests.push(request);
    return {
      provider: request.provider,
      profileId: request.profileId,
      status: 'AUTHENTICATED' as const,
    };
  }
}

describe('MCP tool handlers', () => {
  it('returns structured session status without browser implementation details', async () => {
    const application = new FakeApplication();

    const result = await handleWebSessionStatus(
      { provider: 'chatgpt', profileId: 'default' },
      application,
    );

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      ok: true,
      provider: 'chatgpt',
      profileId: 'default',
      status: 'AUTHENTICATED',
    });
    expect(application.statusRequests).toEqual([
      { provider: 'chatgpt', profileId: 'default' },
    ]);
  });

  it('returns the response text and conversation handle from web_ask', async () => {
    const application = new FakeApplication();

    const result = await handleWebAsk(
      {
        provider: 'chatgpt',
        profileId: 'default',
        prompt: 'Explain SRP',
        conversationId: 'conversation-0',
      },
      application,
    );

    expect(result.content).toEqual([{ type: 'text', text: 'final answer' }]);
    expect(result.structuredContent).toEqual({
      ok: true,
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'conversation-0',
      responseText: 'final answer',
    });
    expect(application.askRequests).toEqual([
      {
        provider: 'chatgpt',
        profileId: 'default',
        prompt: 'Explain SRP',
        conversationId: 'conversation-0',
      },
    ]);
  });

  it('redacts internal details from typed operational errors', () => {
    const result = toMcpToolError(
      new WebAutomationError(
        'PROFILE_BUSY',
        'Profile lock is already held at /home/private/.web-automation-mcp/locks/secret.lock',
      ),
    );

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain('/home/private');
    expect(result.structuredContent).toEqual({
      ok: false,
      error: {
        code: 'PROFILE_BUSY',
        message: 'The selected browser profile is already in use.',
      },
    });
  });

  it('sanitizes unexpected exceptions instead of exposing stack or message content', () => {
    const result = toMcpToolError(new Error('secret cookie value abc123'));

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain('abc123');
    expect(result.content).toEqual([
      { type: 'text', text: 'INTERNAL_ERROR: Unexpected internal error' },
    ]);
  });
});
