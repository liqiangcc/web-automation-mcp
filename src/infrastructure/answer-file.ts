import { constants } from 'node:fs';
import { link, mkdir, open, realpath, rename, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, win32 } from 'node:path';

import { WebAutomationError } from '../domain/errors.js';
import type {
  AnswerFilePort,
  AnswerFileWriteRequest,
  AnswerFileWriteResult,
} from '../ports/answer-file-port.js';

export class RestrictedAtomicAnswerFileWriter implements AnswerFilePort {
  private readonly configuredRoot: string;

  public constructor(outputRoot = process.env.WEB_AUTOMATION_MCP_OUTPUT_ROOT ?? process.cwd()) {
    this.configuredRoot = resolve(outputRoot);
  }

  public async write(request: AnswerFileWriteRequest): Promise<AnswerFileWriteResult> {
    assertSafeRelativePath(request.outputPath);

    let temporaryPath: string | undefined;
    try {
      await mkdir(this.configuredRoot, { recursive: true, mode: 0o700 });
      const root = await realpath(this.configuredRoot);
      const unresolvedTarget = resolve(root, request.outputPath);
      assertInsideRoot(root, unresolvedTarget);

      await mkdir(dirname(unresolvedTarget), { recursive: true, mode: 0o700 });
      const parent = await realpath(dirname(unresolvedTarget));
      assertInsideRoot(root, parent);

      const target = join(parent, basename(unresolvedTarget));
      assertInsideRoot(root, target);
      temporaryPath = join(parent, `.${basename(target)}.${randomUUID()}.tmp`);

      const handle = await open(
        temporaryPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        await handle.writeFile(request.content, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }

      if (request.overwrite) {
        await rename(temporaryPath, target);
      } else {
        await link(temporaryPath, target);
        await unlink(temporaryPath);
      }
      temporaryPath = undefined;

      return {
        filePath: target,
        bytesWritten: Buffer.byteLength(request.content, 'utf8'),
        sha256: createHash('sha256').update(request.content, 'utf8').digest('hex'),
      };
    } catch (error) {
      if (error instanceof WebAutomationError) {
        throw error;
      }
      if (isNodeError(error) && error.code === 'EEXIST') {
        throw new WebAutomationError(
          'FILE_ALREADY_EXISTS',
          'The output file already exists and overwrite was not enabled',
          { cause: error },
        );
      }
      throw new WebAutomationError('FILE_WRITE_FAILED', 'Failed to save the web AI response', {
        cause: error,
      });
    } finally {
      if (temporaryPath !== undefined) {
        await unlink(temporaryPath).catch(() => undefined);
      }
    }
  }
}

export function assertSafeRelativePath(outputPath: string): void {
  const portableSegments = outputPath.replaceAll('\\', '/').split('/');
  if (
    outputPath.length === 0 ||
    outputPath.includes('\0') ||
    outputPath.includes('\\') ||
    isAbsolute(outputPath) ||
    win32.isAbsolute(outputPath) ||
    portableSegments.includes('..') ||
    portableSegments.every((segment) => segment === '' || segment === '.')
  ) {
    throw new WebAutomationError(
      'OUTPUT_PATH_NOT_ALLOWED',
      'outputPath must be a relative path inside the configured output root',
    );
  }
}

function assertInsideRoot(root: string, candidate: string): void {
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
  ) {
    throw new WebAutomationError(
      'OUTPUT_PATH_NOT_ALLOWED',
      'The resolved output path is outside the configured output root',
    );
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
