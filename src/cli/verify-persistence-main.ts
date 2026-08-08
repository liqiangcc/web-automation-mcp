import { WebAutomationError } from '../domain/errors.js';
import { verifyPersistence } from './verify-persistence.js';

const profileId = process.argv[2] ?? 'default';

try {
  const result = await verifyPersistence({ profileId });
  console.log(JSON.stringify(result));
  if (!result.persisted) {
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
