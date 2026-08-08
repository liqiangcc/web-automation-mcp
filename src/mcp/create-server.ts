import { McpServer } from '@modelcontextprotocol/server';

export function createMcpServer(): McpServer {
  return new McpServer({
    name: 'web-automation-mcp',
    version: '0.1.0',
  });
}
