import type { SessionStatus } from '../ports/session-probe.js';
import { checkSessionStatus } from './session-status.js';

export interface VerifyPersistenceCommand {
  readonly profileId: string;
  readonly headless?: boolean;
}

export interface VerifyPersistenceResult {
  readonly profileId: string;
  readonly firstStatus: SessionStatus;
  readonly secondStatus?: SessionStatus;
  readonly persisted: boolean;
}

export interface VerifyPersistenceDependencies {
  readonly check: typeof checkSessionStatus;
}

export async function verifyPersistence(
  command: VerifyPersistenceCommand,
  dependencies: VerifyPersistenceDependencies = { check: checkSessionStatus },
): Promise<VerifyPersistenceResult> {
  const first = await dependencies.check({
    profileId: command.profileId,
    headless: command.headless ?? false,
  });

  if (first.status !== 'AUTHENTICATED') {
    return {
      profileId: command.profileId,
      firstStatus: first.status,
      persisted: false,
    };
  }

  const second = await dependencies.check({
    profileId: command.profileId,
    headless: command.headless ?? false,
  });

  return {
    profileId: command.profileId,
    firstStatus: first.status,
    secondStatus: second.status,
    persisted: second.status === 'AUTHENTICATED',
  };
}
