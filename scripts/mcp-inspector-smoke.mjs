import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';

await access(new URL('../dist/index.js', import.meta.url));

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [
  '--yes',
  '@modelcontextprotocol/inspector@2.0.0',
  '--cli',
  'node',
  'dist/index.js',
  '--method',
  'tools/list',
];

const child = spawn(command, args, {
  cwd: new URL('..', import.meta.url),
  env: { ...process.env, NO_COLOR: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  stdout += chunk;
});
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => {
  stderr += chunk;
});

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});

if (exitCode !== 0) {
  throw new Error(`MCP Inspector exited with ${exitCode}: ${stderr.trim()}`);
}

const result = JSON.parse(stdout.trim());
const tools = Array.isArray(result.tools) ? result.tools : result.result?.tools;
if (!Array.isArray(tools)) {
  throw new Error(`MCP Inspector tools/list returned an unexpected payload: ${stdout.trim()}`);
}

const names = tools.map((tool) => tool.name);
const required = [
  'web_session_status',
  'web_list_conversations',
  'web_get_conversation',
  'web_export_conversation_to_file',
  'web_delete_conversation',
  'web_new_chat',
  'web_ask',
  'web_ask_with_files',
  'web_ask_to_file',
  'web_get_last_response',
];
for (const name of required) {
  if (!names.includes(name)) {
    throw new Error(`MCP Inspector did not discover required tool: ${name}`);
  }
}

console.log(`MCP Inspector discovered: ${required.join(', ')}`);
