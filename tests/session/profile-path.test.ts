import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ProfilePathResolver } from '../../src/session/profile-path.js';

describe('ProfilePathResolver', () => {
  it('keeps profile and lock paths below the configured root', () => {
    const root = resolve('tmp-test-root');
    const resolver = new ProfilePathResolver(root);

    expect(resolver.resolve('chatgpt', 'default')).toEqual({
      rootDir: root,
      profileDir: join(root, 'profiles', 'chatgpt', 'default'),
      lockFile: join(root, 'locks', 'chatgpt--default.lock'),
    });
  });

  it.each(['../escape', 'nested/profile', ' spaced ', '', 'a'.repeat(65)])(
    'rejects unsafe profile id %j',
    (profileId) => {
      expect(() => new ProfilePathResolver('/tmp/root').resolve('chatgpt', profileId)).toThrowError(
        expect.objectContaining({ code: 'INVALID_REQUEST' }),
      );
    },
  );
});
