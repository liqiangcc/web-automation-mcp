import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, win32 } from 'node:path';

import { WebAutomationError } from '../domain/errors.js';
import type { InputFilePort, ResolvedInputFile } from '../ports/input-file-port.js';

const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface RestrictedInputFileResolverOptions {
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
}

export class RestrictedInputFileResolver implements InputFilePort {
  private readonly configuredRoot: string;
  private readonly maxFiles: number;
  private readonly maxFileBytes: number;

  public constructor(
    inputRoot: string,
    options: RestrictedInputFileResolverOptions = {},
  ) {
    this.configuredRoot = resolve(inputRoot);
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    assertPositiveInteger('maxFiles', this.maxFiles);
    assertPositiveInteger('maxFileBytes', this.maxFileBytes);
  }

  public async resolve(inputPaths: readonly string[]): Promise<readonly ResolvedInputFile[]> {
    if (inputPaths.length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'At least one input file is required.');
    }
    if (inputPaths.length > this.maxFiles) {
      throw new WebAutomationError(
        'INVALID_REQUEST',
        `A request may include at most ${this.maxFiles} input files.`,
      );
    }

    let root: string;
    try {
      root = await realpath(this.configuredRoot);
    } catch (error) {
      throw new WebAutomationError(
        'INPUT_PATH_NOT_ALLOWED',
        'The configured input root is not accessible.',
        { cause: error },
      );
    }

    const resolvedFiles: ResolvedInputFile[] = [];
    for (const inputPath of inputPaths) {
      assertSafeRelativeInputPath(inputPath);
      resolvedFiles.push(await this.resolveFile(root, inputPath));
    }
    return resolvedFiles;
  }

  private async resolveFile(root: string, inputPath: string): Promise<ResolvedInputFile> {
    const unresolved = resolve(root, inputPath);
    assertInsideRoot(root, unresolved);

    let canonical: string;
    try {
      canonical = await realpath(unresolved);
    } catch (error) {
      if (isNodeError(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        throw new WebAutomationError('INPUT_FILE_NOT_FOUND', 'The requested input file was not found.', {
          cause: error,
        });
      }
      throw new WebAutomationError(
        'INPUT_PATH_NOT_ALLOWED',
        'The requested input file could not be resolved safely.',
        { cause: error },
      );
    }

    assertInsideRoot(root, canonical);

    let fileStat: Awaited<ReturnType<typeof stat>>;
    try {
      fileStat = await stat(canonical);
    } catch (error) {
      throw new WebAutomationError('INPUT_FILE_NOT_FOUND', 'The requested input file was not found.', {
        cause: error,
      });
    }

    if (!fileStat.isFile()) {
      throw new WebAutomationError(
        'INPUT_PATH_NOT_ALLOWED',
        'The requested input path must resolve to a regular file.',
      );
    }
    if (fileStat.size > this.maxFileBytes) {
      throw new WebAutomationError(
        'INPUT_FILE_TOO_LARGE',
        `The requested input file exceeds the ${this.maxFileBytes} byte local safety limit.`,
      );
    }

    return {
      requestedPath: inputPath,
      filePath: canonical,
      bytes: fileStat.size,
    };
  }
}

export function assertSafeRelativeInputPath(inputPath: string): void {
  const portableSegments = inputPath.replaceAll('\\', '/').split('/');
  if (
    inputPath.length === 0 ||
    inputPath.includes('\0') ||
    inputPath.includes('\\') ||
    isAbsolute(inputPath) ||
    win32.isAbsolute(inputPath) ||
    portableSegments.includes('..') ||
    portableSegments.every((segment) => segment === '' || segment === '.')
  ) {
    throw new WebAutomationError(
      'INPUT_PATH_NOT_ALLOWED',
      'Input file paths must be relative paths inside the configured input root.',
    );
  }
}

function assertInsideRoot(root: string, candidate: string): void {
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new WebAutomationError(
      'INPUT_PATH_NOT_ALLOWED',
      'The resolved input path is outside the configured input root.',
    );
  }
}

function assertPositiveInteger(field: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new WebAutomationError('INVALID_REQUEST', `${field} must be a positive integer.`);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
