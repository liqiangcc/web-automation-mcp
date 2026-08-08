import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { hostname as systemHostname } from 'node:os';
import { dirname } from 'node:path';

import { WebAutomationError } from '../domain/errors.js';

interface LockRecord {
  readonly version: 1;
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
  readonly createdAt: string;
}

export interface ProfileLease {
  readonly lockFile: string;
  release(): Promise<void>;
}

export interface ProfileLockOptions {
  readonly pid?: number;
  readonly hostname?: string;
  readonly now?: () => Date;
  readonly createToken?: () => string;
  readonly isProcessAlive?: (pid: number) => boolean;
}

export class ProfileLock {
  private readonly pid: number;
  private readonly hostname: string;
  private readonly now: () => Date;
  private readonly createToken: () => string;
  private readonly isProcessAlive: (pid: number) => boolean;

  public constructor(options: ProfileLockOptions = {}) {
    this.pid = options.pid ?? process.pid;
    this.hostname = options.hostname ?? systemHostname();
    this.now = options.now ?? (() => new Date());
    this.createToken = options.createToken ?? randomUUID;
    this.isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  }

  public async acquire(lockFile: string): Promise<ProfileLease> {
    await mkdir(dirname(lockFile), { recursive: true });

    const firstAttempt = await this.tryCreate(lockFile);
    if (firstAttempt !== undefined) {
      return firstAttempt;
    }

    const owner = await readLockRecord(lockFile);
    if (owner !== undefined && this.canReclaim(owner)) {
      const current = await readLockRecord(lockFile);
      if (current?.token === owner.token) {
        await rm(lockFile, { force: true });
        const reclaimed = await this.tryCreate(lockFile);
        if (reclaimed !== undefined) {
          return reclaimed;
        }
      }
    }

    throw new WebAutomationError('PROFILE_BUSY', describeBusyProfile(lockFile, owner));
  }

  private async tryCreate(lockFile: string): Promise<ProfileLease | undefined> {
    const record: LockRecord = {
      version: 1,
      token: this.createToken(),
      pid: this.pid,
      hostname: this.hostname,
      createdAt: this.now().toISOString(),
    };

    let handle;
    try {
      handle = await open(lockFile, 'wx', 0o600);
      await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8');
    } catch (error) {
      if (isErrorCode(error, 'EEXIST')) {
        return undefined;
      }
      throw error;
    } finally {
      await handle?.close();
    }

    return new FileProfileLease(lockFile, record.token);
  }

  private canReclaim(owner: LockRecord): boolean {
    return owner.hostname === this.hostname && !this.isProcessAlive(owner.pid);
  }
}

class FileProfileLease implements ProfileLease {
  private released = false;

  public constructor(
    public readonly lockFile: string,
    private readonly token: string,
  ) {}

  public async release(): Promise<void> {
    if (this.released) {
      return;
    }
    this.released = true;

    const current = await readLockRecord(this.lockFile);
    if (current?.token !== this.token) {
      return;
    }

    await rm(this.lockFile, { force: true });
  }
}

async function readLockRecord(lockFile: string): Promise<LockRecord | undefined> {
  try {
    const raw = await readFile(lockFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isLockRecord(parsed)) {
      return undefined;
    }
    return parsed;
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) {
      return undefined;
    }
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

function isLockRecord(value: unknown): value is LockRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Partial<LockRecord>;
  return (
    record.version === 1 &&
    typeof record.token === 'string' &&
    typeof record.pid === 'number' &&
    Number.isSafeInteger(record.pid) &&
    record.pid > 0 &&
    typeof record.hostname === 'string' &&
    typeof record.createdAt === 'string'
  );
}

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !isErrorCode(error, 'ESRCH');
  }
}

function describeBusyProfile(lockFile: string, owner: LockRecord | undefined): string {
  if (owner === undefined) {
    return `Profile lock is already held at ${lockFile}`;
  }

  return `Profile lock is already held by pid ${owner.pid} on ${owner.hostname} since ${owner.createdAt}`;
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
