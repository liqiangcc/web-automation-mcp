import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { RestrictedInputFileResolver } from '../../src/infrastructure/input-file.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'web-automation-input-'));
  temporaryRoots.push(root);
  return root;
}

describe('RestrictedInputFileResolver', () => {
  it('resolves a regular file to a canonical path inside the configured root', async () => {
    const root = await makeRoot();
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'docs', 'a.txt'), 'hello', 'utf8');

    const result = await new RestrictedInputFileResolver(root).resolve(['docs/a.txt']);

    expect(result).toEqual([
      {
        requestedPath: 'docs/a.txt',
        filePath: join(root, 'docs', 'a.txt'),
        bytes: 5,
      },
    ]);
  });

  it('rejects absolute paths and traversal before filesystem access', async () => {
    const root = await makeRoot();
    const resolver = new RestrictedInputFileResolver(root);

    await expect(resolver.resolve(['../secret.txt'])).rejects.toMatchObject({
      code: 'INPUT_PATH_NOT_ALLOWED',
    });
    await expect(resolver.resolve(['/etc/passwd'])).rejects.toMatchObject({
      code: 'INPUT_PATH_NOT_ALLOWED',
    });
    await expect(resolver.resolve(['C:/Users/secret.txt'])).rejects.toMatchObject({
      code: 'INPUT_PATH_NOT_ALLOWED',
    });
  });

  it('rejects a symlink whose canonical target escapes the configured root', async () => {
    if (process.platform === 'win32') {
      return;
    }
    const root = await makeRoot();
    const outside = await makeRoot();
    await writeFile(join(outside, 'secret.txt'), 'secret', 'utf8');
    await symlink(join(outside, 'secret.txt'), join(root, 'link.txt'));

    await expect(new RestrictedInputFileResolver(root).resolve(['link.txt'])).rejects.toMatchObject({
      code: 'INPUT_PATH_NOT_ALLOWED',
    });
  });

  it('classifies missing files without exposing another host path', async () => {
    const root = await makeRoot();

    await expect(new RestrictedInputFileResolver(root).resolve(['missing.txt'])).rejects.toMatchObject({
      code: 'INPUT_FILE_NOT_FOUND',
    });
  });

  it('rejects files above the configured local safety limit', async () => {
    const root = await makeRoot();
    await writeFile(join(root, 'large.txt'), '12345', 'utf8');

    await expect(
      new RestrictedInputFileResolver(root, { maxFileBytes: 4 }).resolve(['large.txt']),
    ).rejects.toMatchObject({ code: 'INPUT_FILE_TOO_LARGE' });
  });
});
