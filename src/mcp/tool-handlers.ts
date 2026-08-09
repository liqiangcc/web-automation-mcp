import type { CallToolResult } from '@modelcontextprotocol/server';

import type {
  AutomationApplicationPort,
  LastResponseRequest,
  NewChatRequest,
  SessionStatusRequest,
} from '../ports/automation-application-port.js';
import type { AskRequest, ConversationId, ProfileId, ProviderId } from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';

export interface WebSessionStatusToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
}

export interface WebAskToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly prompt: string;
  readonly conversationId?: ConversationId;
}

export interface WebNewChatToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
}

export interface WebGetLastResponseToolInput {
  readonly provider: ProviderId;
  readonly profileId: ProfileId;
  readonly conversationId: ConversationId;
}

export async function handleWebSessionStatus(
  input: WebSessionStatusToolInput,
  application: AutomationApplicationPort,
): Promise<CallToolResult> {
  try {
    const request: SessionStatusRequest = {
      provider: input.provider,
      profileId: input.profileId,
    };
    const result = await application.sessionStatus(request);
    return {
      content: [{ type: 'text', text: result.status }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        status: result.status,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export async function handleWebAsk(
  input: WebAskToolInput,
  application: AutomationApplicationPort,
): Promise<CallToolResult> {
  try {
    const request: AskRequest = {
      provider: input.provider,
      profileId: input.profileId,
      prompt: input.prompt,
      ...(input.conversationId === undefined
        ? {}
        : { conversationId: input.conversationId }),
    };
    const result = await application.ask(request);
    return {
      content: [{ type: 'text', text: result.responseText }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversationId: result.conversationId,
        responseText: result.responseText,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export async function handleWebNewChat(
  input: WebNewChatToolInput,
  application: AutomationApplicationPort,
): Promise<CallToolResult> {
  try {
    const request: NewChatRequest = {
      provider: input.provider,
      profileId: input.profileId,
    };
    const result = await application.newChat(request);
    return {
      content: [{ type: 'text', text: result.status }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        status: result.status,
        conversationId: null,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export async function handleWebGetLastResponse(
  input: WebGetLastResponseToolInput,
  application: AutomationApplicationPort,
): Promise<CallToolResult> {
  try {
    const request: LastResponseRequest = {
      provider: input.provider,
      profileId: input.profileId,
      conversationId: input.conversationId,
    };
    const result = await application.getLastResponse(request);
    return {
      content: [{ type: 'text', text: result.responseText }],
      structuredContent: {
        ok: true,
        provider: result.provider,
        profileId: result.profileId,
        conversationId: result.conversationId,
        responseText: result.responseText,
      },
    };
  } catch (error) {
    return toMcpToolError(error);
  }
}

export function toMcpToolError(error: unknown): CallToolResult {
  if (error instanceof WebAutomationError) {
    const message = publicMessageFor(error);
    return {
      isError: true,
      content: [{ type: 'text', text: `${error.code}: ${message}` }],
      structuredContent: {
        ok: false,
        error: {
          code: error.code,
          message,
        },
      },
    };
  }

  return {
    isError: true,
    content: [{ type: 'text', text: 'INTERNAL_ERROR: Unexpected internal error' }],
    structuredContent: {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected internal error',
      },
    },
  };
}

function publicMessageFor(error: WebAutomationError): string {
  switch (error.code) {
    case 'INVALID_REQUEST':
      return error.message;
    case 'UNSUPPORTED_PROVIDER':
      return 'The requested provider is not supported.';
    case 'AUTH_REQUIRED':
      return 'The selected browser profile must be authenticated before this operation can run.';
    case 'PROFILE_BUSY':
      return 'The selected browser profile is already in use.';
    case 'NAVIGATION_FAILED':
      return 'Failed to open the provider page.';
    case 'TARGET_NOT_FOUND':
      return 'The provider page no longer exposes an expected interaction target.';
    case 'GENERATION_TIMEOUT':
      return 'The provider did not finish generating a response before the timeout.';
    case 'EXTRACTION_FAILED':
      return 'The provider response could not be extracted reliably.';
    case 'PROVIDER_UNAVAILABLE':
      return 'The provider page is currently unavailable.';
    case 'PROVIDER_CHANGED':
      return 'The provider page behavior appears to have changed.';
  }
}
