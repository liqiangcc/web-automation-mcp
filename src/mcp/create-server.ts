import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { AutomationApplicationPort } from '../ports/automation-application-port.js';
import { handleWebAsk, handleWebSessionStatus } from './tool-handlers.js';

const ProviderSchema = z.literal('chatgpt').optional();
const ProfileIdSchema = z
  .string()
  .min(1)
  .max(64)
  .describe('Local persistent browser profile id, for example default');

export function createMcpServer(application: AutomationApplicationPort): McpServer {
  const server = new McpServer({
    name: 'web-automation-mcp',
    version: '0.1.0',
  });

  server.registerTool(
    'web_session_status',
    {
      title: 'Web session status',
      description:
        'Check whether a persistent browser profile is authenticated for the selected web provider.',
      inputSchema: z.object({
        provider: ProviderSchema.describe('Web provider. ChatGPT is the only provider in v0.1.'),
        profileId: ProfileIdSchema,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ provider, profileId }) =>
      handleWebSessionStatus(
        {
          provider: provider ?? 'chatgpt',
          profileId,
        },
        application,
      ),
  );

  server.registerTool(
    'web_ask',
    {
      title: 'Ask a web AI',
      description:
        'Send a prompt through an authenticated persistent web AI session and return the completed response. Pass conversationId to continue an existing conversation.',
      inputSchema: z.object({
        provider: ProviderSchema.describe('Web provider. ChatGPT is the only provider in v0.1.'),
        profileId: ProfileIdSchema,
        prompt: z.string().min(1).describe('Prompt to submit to the web AI.'),
        conversationId: z
          .string()
          .min(1)
          .optional()
          .describe('Existing provider conversation id. Omit to start a new conversation.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ provider, profileId, prompt, conversationId }) =>
      handleWebAsk(
        {
          provider: provider ?? 'chatgpt',
          profileId,
          prompt,
          ...(conversationId === undefined ? {} : { conversationId }),
        },
        application,
      ),
  );

  return server;
}
