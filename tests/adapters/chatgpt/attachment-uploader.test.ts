import { describe, expect, it } from 'vitest';

import { ChatGptAttachmentUploader } from '../../../src/adapters/chatgpt/attachment-uploader.js';
import type { BrowserPagePort, LocatorCandidate } from '../../../src/ports/browser-port.js';

describe('ChatGptAttachmentUploader', () => {
  it('uses existence-based fallback so hidden file inputs can be automated', async () => {
    const page = new AttachmentPage();

    const result = await new ChatGptAttachmentUploader(page).upload(['/safe/a.pdf', '/safe/b.txt']);

    expect(result.fileCount).toBe(2);
    expect(page.checked).toEqual([
      { kind: 'css', value: 'input[type="file"][multiple]' },
      { kind: 'css', value: 'input[type="file"]' },
    ]);
    expect(page.uploaded).toEqual({
      locator: { kind: 'css', value: 'input[type="file"]' },
      filePaths: ['/safe/a.pdf', '/safe/b.txt'],
    });
  });

  it('classifies browser attachment failures as FILE_UPLOAD_FAILED', async () => {
    const page = new AttachmentPage();
    page.failUpload = true;

    await expect(new ChatGptAttachmentUploader(page).upload(['/safe/a.pdf'])).rejects.toMatchObject({
      code: 'FILE_UPLOAD_FAILED',
    });
  });
});

class AttachmentPage implements BrowserPagePort {
  public readonly checked: LocatorCandidate[] = [];
  public uploaded: { locator: LocatorCandidate; filePaths: readonly string[] } | undefined;
  public failUpload = false;

  public async goto(): Promise<void> {}
  public async isVisible(): Promise<boolean> {
    return false;
  }
  public async exists(locator: LocatorCandidate): Promise<boolean> {
    this.checked.push(locator);
    return locator.kind === 'css' && locator.value === 'input[type="file"]';
  }
  public async fill(): Promise<void> {}
  public async click(): Promise<void> {}
  public async press(): Promise<void> {}
  public async setInputFiles(locator: LocatorCandidate, filePaths: readonly string[]): Promise<void> {
    if (this.failUpload) {
      throw new Error('browser rejected upload');
    }
    this.uploaded = { locator, filePaths };
  }
  public async textContents(): Promise<readonly string[]> {
    return [];
  }
}
