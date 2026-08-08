import { WebAutomationError } from '../domain/errors.js';
import type { SessionStatus } from '../ports/session-probe.js';
import { createDefaultLoginDependencies, login } from './login.js';

const profileId = process.argv[2] ?? 'default';

console.error(`Opening ChatGPT with persistent profile "${profileId}".`);
console.error('Complete sign-in in the browser window. Credentials stay in the browser profile.');

try {
  const result = await login(
    { profileId },
    createDefaultLoginDependencies((status) => reportStatus(status)),
  );
  console.log(result.message);
} catch (error) {
  if (error instanceof WebAutomationError) {
    console.error(`${error.code}: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}

function reportStatus(status: SessionStatus): void {
  if (status === 'AUTHENTICATED') {
    console.error('Authentication confirmed.');
    return;
  }
  if (status === 'AUTH_REQUIRED') {
    console.error('Waiting for ChatGPT sign-in to complete...');
    return;
  }
  console.error('ChatGPT page is not in a recognized authentication state yet; continuing to wait...');
}
