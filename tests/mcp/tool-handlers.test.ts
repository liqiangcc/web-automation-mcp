import { describe, expect, it } from 'vitest';

import { WebAutomationError } from '../../src/domain/errors.js';
import {
  handleWebAsk,
  handleWebAskToFile,
  handleWebGetLastResponse,
  handleWebNewChat,
  handleWebSessionStatus,
  toMcpToolError,
} from '../../src/mcp/tool-handlers.js';
import type {
  AutomationApplicationPort,
  LastResponseRequest,
  NewChatRequest,
  SessionStatusRequest,
} from '../../src/ports/automation-application-port.js';
import type { AskRequest, AskResult } from '../../src/domain/conversation.js';
import type { AskToFileRequest, AskToFileResult } from '../../src/domain/conversation.js';

class FakeApplication implements AutomationApplicationPort {
  public askRequests: AskRequest[] = [];
  public askToFileRequests: AskToFileRequest[] = [];
  public statusRequests: SessionStatusRequest[] = [];
  public newChatRequests: NewChatRequest[] = [];
  public lastResponseRequests: LastResponseRequest[] = [];

  public async ask(request: AskRequest): Promise<AskResult> {
    this.askRequests.push(request);
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId ?? 'conversation-1',
      responseText: 'final answer',
    };
  }

  public async askToFile(request: AskToFileRequest): Promise<AskToFileResult> {
    this.askToFileRequests.push(request);
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId ?? 'conversation-file-1',
      filePath: '/workspace/results/answer.md',
      bytesWritten: 12,
      sha256: 'abc123',
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

  public async newChat(request: NewChatRequest) {
    this.newChatRequests.push(request);
    return {
      provider: request.provider,
      profileId: request.profileId,
      status: 'READY' as const,
    };
  }

  public async getLastResponse(request: LastResponseRequest) {
    this.lastResponseRequests.push(request);
    return {
      provider: request.provider,
      profileId: request.profileId,
      conversationId: request.conversationId,
      responseText: 'latest answer',
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
  });

  it('returns READY for a fresh chat and does not invent a conversation id', async () => {
    const application = new FakeApplication();

    const result = await handleWebNewChat(
      { provider: 'chatgpt', profileId: 'default' },
      application,
    );

    expect(result.structuredContent).toEqual({
      ok: true,
      provider: 'chatgpt',
      profileId: 'default',
      status: 'READY',
      conversationId: null,
    });
    expect(application.newChatRequests).toEqual([{ provider: 'chatgpt', profileId: 'default' }]);
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
  });

  it('returns only file metadata from web_ask_to_file', async () => {
    const application = new FakeApplication();

    const result = await handleWebAskToFile(
      {
        provider: 'chatgpt',
        profileId: 'default',
        prompt: 'write a long private answer',
        outputPath: 'results/answer.md',
      },
      application,
    );

    expect(result.content).toEqual([
      {
        type: 'text',
        text: 'Saved web AI response to /workspace/results/answer.md (12 bytes).',
      },
    ]);
    expect(result.structuredContent).toEqual({
      ok: true,
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'conversation-file-1',
      filePath: '/workspace/results/answer.md',
      bytesWritten: 12,
      sha256: 'abc123',
    });
    expect(JSON.stringify(result)).not.toContain('long private answer');
    expect(application.askToFileRequests).toEqual([
      {
        provider: 'chatgpt',
        profileId: 'default',
        prompt: 'write a long private answer',
        outputPath: 'results/answer.md',
        overwrite: false,
      },
    ]);
  });

  it('returns the latest assistant response for an existing conversation', async () => {
    const application = new FakeApplication();

    const result = await handleWebGetLastResponse(
      {
        provider: 'chatgpt',
        profileId: 'default',
        conversationId: 'conversation-1',
      },
      application,
    );

    expect(result.content).toEqual([{ type: 'text', text: 'latest answer' }]);
    expect(result.structuredContent).toEqual({
      ok: true,
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'conversation-1',
      responseText: 'latest answer',
    });
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
