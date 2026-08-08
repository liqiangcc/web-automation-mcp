import { WebAutomationError } from '../domain/errors.js';
import { checkSessionStatus } from './session-status.js';

const profileId = process.argv[2] ?? 'default';

try {
  const result = await checkSessionStatus({ profileId });
  console.log(`${result.profileId}: ${result.status}`);
  if (result.status !== 'AUTHENTICATED') {
    process.exitCode = 2;
  }
} catch (error) {
  if (error instanceof WebAutomationError) {
    console.error(`${error.code}: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
