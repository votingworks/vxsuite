import { expect, test } from 'vitest';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { napi } from './napi.js';

const SYNC_PATH_BINDINGS = [
  ['fadviseDontNeed', napi.fadviseDontNeed],
  ['lockFileExclusiveNonblocking', napi.lockFileExclusiveNonblocking],
] as const;

function missingPath(): string {
  return join(makeTemporaryDirectory(), 'missing', 'file');
}

test.each(SYNC_PATH_BINDINGS)(
  '%s reports the errno and path when it cannot open the path',
  (_name, fn) => {
    const path = missingPath();
    expect(() => fn(path)).toThrow(
      `ENOENT: No such file or directory, open '${path}'`
    );
  }
);

test.each(SYNC_PATH_BINDINGS)(
  '%s reports EINVAL for a path containing a NUL byte',
  (_name, fn) => {
    expect(() => fn('bad\0path')).toThrow(/^EINVAL: /);
  }
);

test('syncfs rejects with the errno and path when it cannot open the path', async () => {
  const path = missingPath();
  const result = napi.syncfs(path);
  expect(result).toBeInstanceOf(Promise);
  await expect(result).rejects.toThrow(
    `ENOENT: No such file or directory, open '${path}'`
  );
});

test('syncfs rejects with EINVAL for a path containing a NUL byte', async () => {
  await expect(napi.syncfs('bad\0path')).rejects.toThrow(/^EINVAL: /);
});

test('lockFileExclusiveNonblocking holds the lock until released', () => {
  const path = join(makeTemporaryDirectory(), 'lock');
  const lock = napi.lockFileExclusiveNonblocking(path);

  expect(() => napi.lockFileExclusiveNonblocking(path)).toThrow(/^EAGAIN: /);

  lock.release();
  lock.release();
  napi.lockFileExclusiveNonblocking(path).release();
});
