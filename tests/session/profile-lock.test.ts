import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProfileLock } from '../../src/session/profile-lock.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('ProfileLock', () => {
  it('rejects concurrent acquisition and allows acquisition after release', async () => {
    const root = await createTempDir();
    const lockFile = join(root, 'locks', 'chatgpt--default.lock');
    const lock = new ProfileLock();

    const first = await lock.acquire(lockFile);

    await expect(lock.acquire(lockFile)).rejects.toMatchObject({ code: 'PROFILE_BUSY' });

    await first.release();
    const second = await lock.acquire(lockFile);
    await second.release();
  });

  it('reclaims a lock from a dead process on the same host', async () => {
    const root = await createTempDir();
    const lockFile = join(root, 'locks', 'chatgpt--default.lock');
    await mkdir(dirname(lockFile), { recursive: true });
    await writeFile(
      lockFile,
      `${JSON.stringify({
        version: 1,
        token: 'stale-token',
        pid: 999_999,
        hostname: 'test-host',
        createdAt: '2026-08-08T00:00:00.000Z',
      })}\n`,
      'utf8',
    );

    const lock = new ProfileLock({
      pid: 123,
      hostname: 'test-host',
      createToken: () => 'new-token',
      isProcessAlive: () => false,
    });

    const lease = await lock.acquire(lockFile);
    await lease.release();
  });
});

async function createTempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'web-automation-mcp-'));
  tempDirs.push(path);
  return path;
}
