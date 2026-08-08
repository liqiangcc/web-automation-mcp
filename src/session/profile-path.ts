import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import type { ProfileId, ProviderId } from '../domain/conversation.js';
import { WebAutomationError } from '../domain/errors.js';

const SAFE_PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface ProfilePaths {
  readonly rootDir: string;
  readonly profileDir: string;
  readonly lockFile: string;
}

export class ProfilePathResolver {
  private readonly rootDir: string;

  public constructor(rootDir = process.env.WEB_AUTOMATION_MCP_HOME ?? join(homedir(), '.web-automation-mcp')) {
    this.rootDir = resolve(rootDir);
  }

  public resolve(provider: ProviderId, profileId: ProfileId): ProfilePaths {
    this.assertSafeSegment('provider', provider);
    this.assertSafeSegment('profileId', profileId);

    return {
      rootDir: this.rootDir,
      profileDir: join(this.rootDir, 'profiles', provider, profileId),
      lockFile: join(this.rootDir, 'locks', `${provider}--${profileId}.lock`),
    };
  }

  private assertSafeSegment(field: string, value: string): void {
    if (value !== value.trim() || !SAFE_PATH_SEGMENT.test(value)) {
      throw new WebAutomationError(
        'INVALID_REQUEST',
        `${field} must be 1-64 characters using only letters, numbers, dot, underscore, or hyphen`,
      );
    }
  }
}
