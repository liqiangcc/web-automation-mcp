import { describe, expect, it } from 'vitest';

import { verifyPersistence } from '../../src/cli/verify-persistence.js';
import type { SessionStatus } from '../../src/ports/session-probe.js';

describe('verifyPersistence', () => {
  it('passes only when two independent checks remain authenticated', async () => {
    const statuses: SessionStatus[] = ['AUTHENTICATED', 'AUTHENTICATED'];
    let calls = 0;

    const result = await verifyPersistence(
      { profileId: 'default' },
      {
        check: async ({ profileId }) => ({
          profileId,
          status: statuses[calls++] ?? 'UNKNOWN',
        }),
      },
    );

    expect(result).toEqual({
      profileId: 'default',
      firstStatus: 'AUTHENTICATED',
      secondStatus: 'AUTHENTICATED',
      persisted: true,
    });
    expect(calls).toBe(2);
  });

  it('stops after the first check when authentication is already missing', async () => {
    let calls = 0;

    const result = await verifyPersistence(
      { profileId: 'default' },
      {
        check: async ({ profileId }) => {
          calls += 1;
          return { profileId, status: 'AUTH_REQUIRED' };
        },
      },
    );

    expect(result).toEqual({
      profileId: 'default',
      firstStatus: 'AUTH_REQUIRED',
      persisted: false,
    });
    expect(calls).toBe(1);
  });
});
