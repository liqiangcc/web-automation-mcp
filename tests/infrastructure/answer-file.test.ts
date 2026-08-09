import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { RestrictedAtomicAnswerFileWriter } from '../../src/infrastructure/answer-file.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('RestrictedAtomicAnswerFileWriter', () => {
  it('atomically writes a private UTF-8 file and returns metadata', async () => {
    const root = await temporaryRoot();
    const writer = new RestrictedAtomicAnswerFileWriter(root);
    const content = '# 回答\n\n完整正文';

    const result = await writer.write({
      outputPath: 'reports/answer.md',
      content,
      overwrite: false,
    });

    expect(result).toEqual({
      filePath: join(root, 'reports', 'answer.md'),
      bytesWritten: Buffer.byteLength(content, 'utf8'),
      sha256: createHash('sha256').update(content).digest('hex'),
    });
    expect(await readFile(result.filePath, 'utf8')).toBe(content);
    expect(await readdir(join(root, 'reports'))).toEqual(['answer.md']);
    if (process.platform !== 'win32') {
      expect((await stat(result.filePath)).mode & 0o777).toBe(0o600);
    }
  });

  it('does not replace an existing file unless overwrite is enabled', async () => {
    const root = await temporaryRoot();
    const outputPath = join(root, 'answer.md');
    await writeFile(outputPath, 'original', { mode: 0o600 });
    const writer = new RestrictedAtomicAnswerFileWriter(root);

    await expect(
      writer.write({ outputPath: 'answer.md', content: 'replacement', overwrite: false }),
    ).rejects.toMatchObject({ code: 'FILE_ALREADY_EXISTS' });

    expect(await readFile(outputPath, 'utf8')).toBe('original');
    expect(await readdir(root)).toEqual(['answer.md']);

    await writer.write({ outputPath: 'answer.md', content: 'replacement', overwrite: true });
    expect(await readFile(outputPath, 'utf8')).toBe('replacement');
  });

  it.each(['../outside.md', '/tmp/outside.md', 'C:\\outside.md', '.', 'folder\\file.md'])(
    'rejects unsafe output path %s',
    async (outputPath) => {
      const root = await temporaryRoot();
      const writer = new RestrictedAtomicAnswerFileWriter(root);

      await expect(
        writer.write({ outputPath, content: 'secret response', overwrite: false }),
      ).rejects.toMatchObject({ code: 'OUTPUT_PATH_NOT_ALLOWED' });
    },
  );

  it('rejects a parent symlink that escapes the configured root', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await symlink(outside, join(root, 'escape'), 'dir');
    const writer = new RestrictedAtomicAnswerFileWriter(root);

    await expect(
      writer.write({
        outputPath: 'escape/answer.md',
        content: 'secret response',
        overwrite: false,
      }),
    ).rejects.toMatchObject({ code: 'OUTPUT_PATH_NOT_ALLOWED' });

    await expect(readFile(join(outside, 'answer.md'), 'utf8')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'web-automation-answer-file-'));
  temporaryRoots.push(root);
  return root;
}
