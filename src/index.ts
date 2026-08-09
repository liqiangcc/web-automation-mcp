import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createMcpServer } from './mcp/create-server.js';
import { createDefaultAutomationApplication } from './runtime/create-default-application.js';

void serveStdio(() => createMcpServer(createDefaultAutomationApplication()));
console.error('web-automation-mcp running on stdio');
