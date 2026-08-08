import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { createMcpServer } from './mcp/create-server.js';

void serveStdio(createMcpServer);
console.error('web-automation-mcp running on stdio');
