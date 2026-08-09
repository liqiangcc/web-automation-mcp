import { describe, expect, it } from 'vitest';

import { AskWithFilesUseCase } from '../../src/application/ask-with-files.js';
import type { InputFilePort } from '../../src/ports/input-file-port.js';
import type { ProviderAttachmentPort } from '../../src/ports/provider-attachment-port.js';

describe('AskWithFilesUseCase', () => {
  it('resolves local files before sending only canonical paths to the provider', async () => {
    const requested: readonly string[][] = [];
    const providerCalls: unknown[] = [];
    const inputFiles: InputFilePort = {
      resolve: async (paths) => {
        (requested as string[][]).push([...paths]);
        return [
          { requestedPath: paths[0] as string, filePath: '/private/root/a.pdf', bytes: 10 },
          { requestedPath: paths[1] as string, filePath: '/private/root/b.txt', bytes: 20 },
        ];
      },
    };
    const provider: ProviderAttachmentPort = {
      id: 'chatgpt',
      askWithFiles: async (input) => {
        providerCalls.push(input);
        return { conversationId: 'conversation-1', responseText: 'analysis complete' };
      },
    };
    const useCase = new AskWithFilesUseCase(new Map([[provider.id, provider]]), inputFiles);

    const result = await useCase.execute({
      provider: 'chatgpt',
      profileId: 'default',
      prompt: ' analyze these ',
      files: ['docs/a.pdf', 'docs/b.txt'],
    });

    expect(requested).toEqual([['docs/a.pdf', 'docs/b.txt']]);
    expect(providerCalls).toEqual([
      {
        profileId: 'default',
        prompt: 'analyze these',
        filePaths: ['/private/root/a.pdf', '/private/root/b.txt'],
      },
    ]);
    expect(result).toEqual({
      provider: 'chatgpt',
      profileId: 'default',
      conversationId: 'conversation-1',
      responseText: 'analysis complete',
      fileCount: 2,
    });
    expect(JSON.stringify(result)).not.toContain('/private/root');
  });

  it('rejects an empty file list before touching the input resolver', async () => {
    let resolved = false;
    const useCase = new AskWithFilesUseCase(
      new Map([
        [
          'chatgpt',
          {
            id: 'chatgpt',
            askWithFiles: async () => ({ conversationId: 'unused', responseText: 'unused' }),
          },
        ],
      ]),
      {
        resolve: async () => {
          resolved = true;
          return [];
        },
      },
    );

    await expect(
      useCase.execute({ provider: 'chatgpt', profileId: 'default', prompt: 'hello', files: [] }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(resolved).toBe(false);
  });
});
