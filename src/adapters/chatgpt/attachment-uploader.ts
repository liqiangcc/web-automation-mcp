import { WebAutomationError } from '../../domain/errors.js';
import type { BrowserPagePort, LocatorCandidate } from '../../ports/browser-port.js';
import { ChatGptTargetResolver } from './target-resolver.js';

export interface AttachmentUploadResult {
  readonly target: LocatorCandidate;
  readonly fileCount: number;
}

export class ChatGptAttachmentUploader {
  private readonly resolver: ChatGptTargetResolver;

  public constructor(
    private readonly page: BrowserPagePort,
    resolver?: ChatGptTargetResolver,
  ) {
    this.resolver = resolver ?? new ChatGptTargetResolver(page);
  }

  public async upload(filePaths: readonly string[]): Promise<AttachmentUploadResult> {
    if (filePaths.length === 0) {
      throw new WebAutomationError('INVALID_REQUEST', 'At least one attachment is required.');
    }

    const target = await this.resolver.findExisting('file-input');
    if (target === undefined) {
      throw new WebAutomationError(
        'TARGET_NOT_FOUND',
        'Could not resolve the ChatGPT file input target.',
      );
    }

    const setInputFiles = this.page.setInputFiles;
    if (setInputFiles === undefined) {
      throw new WebAutomationError(
        'FILE_UPLOAD_FAILED',
        'The browser adapter does not support file input automation.',
      );
    }

    try {
      await setInputFiles.call(this.page, target, filePaths);
    } catch (error) {
      if (error instanceof WebAutomationError) {
        throw error;
      }
      throw new WebAutomationError('FILE_UPLOAD_FAILED', 'Failed to attach files to ChatGPT.', {
        cause: error,
      });
    }

    return { target, fileCount: filePaths.length };
  }
}
