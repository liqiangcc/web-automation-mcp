import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { AttachmentApplicationPort } from '../ports/attachment-application-port.js';
import type { AutomationApplicationPort } from '../ports/automation-application-port.js';
import type { ConversationCatalogApplicationPort } from '../ports/conversation-catalog-port.js';
import type { ConversationExportApplicationPort } from '../ports/conversation-export-port.js';
import type { ConversationMutationApplicationPort } from '../ports/conversation-mutation-port.js';
import type { ConversationReaderApplicationPort } from '../ports/conversation-reader-port.js';
import { handleWebDeleteConversation } from './conversation-delete-tool-handler.js';
import { handleWebExportConversationToFile } from './conversation-export-tool-handler.js';
import {
  handleWebAsk,
  handleWebAskToFile,
  handleWebAskWithFiles,
  handleWebGetConversation,
  handleWebGetLastResponse,
  handleWebListConversations,
  handleWebNewChat,
  handleWebSessionStatus,
} from './tool-handlers.js';

const ProviderSchema = z.literal('chatgpt').optional();
const ProfileIdSchema = z
  .string()
  .min(1)
  .max(64)
  .describe('Local persistent browser profile id, for example default');
const ConversationIdSchema = z.string().min(1).describe('Provider conversation id.');

export function createMcpServer(
  application: AutomationApplicationPort &
    Partial<AttachmentApplicationPort> &
    Partial<ConversationCatalogApplicationPort> &
    Partial<ConversationReaderApplicationPort> &
    Partial<ConversationExportApplicationPort> &
    Partial<ConversationMutationApplicationPort>,
): McpServer {
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
    'web_list_conversations',
    {
      title: 'List web AI conversations',
      description:
        'List recent provider conversations as lightweight conversation ids and titles. Use nextCursor for bounded pagination; message bodies are never returned by this tool.',
      inputSchema: z.object({
        provider: ProviderSchema.describe('Web provider. ChatGPT is the only provider in v0.1.'),
        profileId: ProfileIdSchema,
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum conversations to return. Defaults to 20; maximum 50.'),
        cursor: z
          .string()
          .min(1)
          .optional()
          .describe('Opaque cursor returned by a previous web_list_conversations call.'),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ provider, profileId, limit, cursor }) =>
      handleWebListConversations(
        {
          provider: provider ?? 'chatgpt',
          profileId,
          ...(limit === undefined ? {} : { limit }),
          ...(cursor === undefined ? {} : { cursor }),
        },
        application,
      ),
  );

  server.registerTool(
    'web_get_conversation',
    {
      title: 'Get web AI conversation',
      description:
        'Open one explicit provider conversation and return its ordered semantic user/assistant message transcript without submitting a prompt.',
      inputSchema: z.object({
        provider: ProviderSchema.describe('Web provider. ChatGPT is the only provider in v0.1.'),
        profileId: ProfileIdSchema,
        conversationId: ConversationIdSchema,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ provider, profileId, conversationId }) =>
      handleWebGetConversation(
        {
          provider: provider ?? 'chatgpt',
          profileId,
          conversationId,
        },
        application,
      ),
  );

  server.registerTool(
    'web_export_conversation_to_file',
    {
      title: 'Export web AI conversation to file',
      description:
        'Read one explicit provider conversation, render a deterministic Markdown transcript, and save it beneath the configured output root without returning the full transcript to the MCP client.',
      inputSchema: z.object({
        provider: ProviderSchema.describe('Web provider. ChatGPT is the only provider in v0.1.'),
        profileId: ProfileIdSchema,
        conversationId: ConversationIdSchema,
        outputPath: z
          .string()
          .min(1)
          .max(4096)
          .describe('Relative transcript output path inside the configured output root.'),
        overwrite: z
          .boolean()
          .optional()
          .describe('Replace an existing output file. Defaults to false.'),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ provider, profileId, conversationId, outputPath, overwrite }) =>
      handleWebExportConversationToFile(
        {
          provider: provider ?? 'chatgpt',
          profileId,
          conversationId,
          outputPath,
          ...(overwrite === undefined ? {} : { overwrite }),
        },
        application,
      ),
  );

  server.registerTool(
    'web_delete_conversation',
    {
      title: 'Delete one web AI conversation',
      description:
        'Permanently delete exactly one explicit provider conversation. The target must be supplied as conversationId; the tool never derives a destructive target from the active browser state or title.',
      inputSchema: z.object({
        provider: ProviderSchema.describe('Web provider. ChatGPT is the only provider in v0.1.'),
        profileId: ProfileIdSchema,
        conversationId: ConversationIdSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ provider, profileId, conversationId }) =>
      handleWebDeleteConversation(
        {
          provider: provider ?? 'chatgpt',
          profileId,
          conversationId,
        },
        application,
      ),
  );

  server.registerTool(
    'web_new_chat',
    {
      title: 'Start a new web chat',
      description:
        'Open and validate a fresh authenticated chat. No stable conversation id exists until the first prompt is sent; use web_ask without conversationId to create it.',
      inputSchema: z.object({
        provider: ProviderSchema.describe('Web provider. ChatGPT is the only provider in v0.1.'),
        profileId: ProfileIdSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ provider, profileId }) =>
      handleWebNewChat(
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
        conversationId: ConversationIdSchema.optional().describe(
          'Existing provider conversation id. Omit to start a new conversation.',
        ),
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

  server.registerTool(
    'web_ask_with_files',
    {
      title: 'Ask a web AI with local files',
      description:
        'Upload one or more local files from WEB_AUTOMATION_MCP_INPUT_ROOT to the authenticated web AI session, submit a prompt, and return the completed response. Input paths must be relative to the configured input root.',
      inputSchema: z.object({
        provider: ProviderSchema.describe('Web provider. ChatGPT is the only provider in v0.1.'),
        profileId: ProfileIdSchema,
        prompt: z.string().min(1).describe('Prompt to submit with the attachments.'),
        files: z
          .array(z.string().min(1).max(4096))
          .min(1)
          .max(10)
          .describe('Relative local file paths inside WEB_AUTOMATION_MCP_INPUT_ROOT.'),
        conversationId: ConversationIdSchema.optional().describe(
          'Existing provider conversation id. Omit to start a new conversation.',
        ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ provider, profileId, prompt, files, conversationId }) =>
      handleWebAskWithFiles(
        {
          provider: provider ?? 'chatgpt',
          profileId,
          prompt,
          files,
          ...(conversationId === undefined ? {} : { conversationId }),
        },
        application,
      ),
  );

  server.registerTool(
    'web_ask_to_file',
    {
      title: 'Ask a web AI and save the response',
      description:
        'Send a prompt through an authenticated web AI session and save the completed response directly to a UTF-8 file. The full response is not returned to the MCP client. outputPath must be relative to WEB_AUTOMATION_MCP_OUTPUT_ROOT, or to the MCP working directory when that variable is unset.',
      inputSchema: z.object({
        provider: ProviderSchema.describe('Web provider. ChatGPT is the only provider in v0.1.'),
        profileId: ProfileIdSchema,
        prompt: z.string().min(1).describe('Prompt to submit to the web AI.'),
        outputPath: z
          .string()
          .min(1)
          .max(4096)
          .describe('Relative UTF-8 output file path inside the configured output root.'),
        overwrite: z
          .boolean()
          .optional()
          .describe('Replace an existing output file. Defaults to false.'),
        conversationId: ConversationIdSchema.optional().describe(
          'Existing provider conversation id. Omit to start a new conversation.',
        ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ provider, profileId, prompt, outputPath, overwrite, conversationId }) =>
      handleWebAskToFile(
        {
          provider: provider ?? 'chatgpt',
          profileId,
          prompt,
          outputPath,
          ...(overwrite === undefined ? {} : { overwrite }),
          ...(conversationId === undefined ? {} : { conversationId }),
        },
        application,
      ),
  );

  server.registerTool(
    'web_get_last_response',
    {
      title: 'Get last web AI response',
      description:
        'Open an existing provider conversation and return its latest non-empty assistant response without submitting a new prompt.',
      inputSchema: z.object({
        provider: ProviderSchema.describe('Web provider. ChatGPT is the only provider in v0.1.'),
        profileId: ProfileIdSchema,
        conversationId: ConversationIdSchema,
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    async ({ provider, profileId, conversationId }) =>
      handleWebGetLastResponse(
        {
          provider: provider ?? 'chatgpt',
          profileId,
          conversationId,
        },
        application,
      ),
  );

  return server;
}
