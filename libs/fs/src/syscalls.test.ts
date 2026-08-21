import { afterEach, expect, test, vi } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok } from '@votingworks/basics';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { napi } from './napi';
import { dropPageCache, exchangePaths, renameNoReplace } from './syscalls';

afterEach(() => {
  vi.restoreAllMocks();
});

test('exchangePaths swaps two directories', () => {
  const root = makeTemporaryDirectory();
  mkdirSync(join(root, 'a'));
  mkdirSync(join(root, 'b'));
  writeFileSync(join(root, 'a', 'file'), 'from a');
  writeFileSync(join(root, 'b', 'file'), 'from b');

  expect(exchangePaths(join(root, 'a'), join(root, 'b'))).toEqual(ok());

  expect(readFileSync(join(root, 'a', 'file'), 'utf-8')).toEqual('from b');
  expect(readFileSync(join(root, 'b', 'file'), 'utf-8')).toEqual('from a');
});

test('exchangePaths swaps two files', () => {
  const root = makeTemporaryDirectory();
  writeFileSync(join(root, 'a'), 'from a');
  writeFileSync(join(root, 'b'), 'from b');

  expect(exchangePaths(join(root, 'a'), join(root, 'b'))).toEqual(ok());

  expect(readFileSync(join(root, 'a'), 'utf-8')).toEqual('from b');
  expect(readFileSync(join(root, 'b'), 'utf-8')).toEqual('from a');
});

test('exchangePaths fails when either path does not exist', () => {
  const root = makeTemporaryDirectory();
  writeFileSync(join(root, 'a'), 'from a');

  expect(exchangePaths(join(root, 'a'), join(root, 'missing'))).toEqual(
    err({ code: 'ENOENT', message: expect.stringContaining('ENOENT') })
  );

  // Unlike a plain rename, a failed exchange has moved nothing.
  expect(readFileSync(join(root, 'a'), 'utf-8')).toEqual('from a');
});

test('renameNoReplace renames onto a free name', () => {
  const root = makeTemporaryDirectory();
  writeFileSync(join(root, 'a'), 'contents');

  expect(renameNoReplace(join(root, 'a'), join(root, 'b'))).toEqual(ok());

  expect(readFileSync(join(root, 'b'), 'utf-8')).toEqual('contents');
});

test('renameNoReplace refuses to replace an existing name', () => {
  const root = makeTemporaryDirectory();
  writeFileSync(join(root, 'a'), 'from a');
  writeFileSync(join(root, 'b'), 'from b');

  expect(renameNoReplace(join(root, 'a'), join(root, 'b'))).toEqual(
    err({ code: 'EEXIST', message: expect.stringContaining('EEXIST') })
  );

  // The point of NOREPLACE: the existing file is untouched.
  expect(readFileSync(join(root, 'a'), 'utf-8')).toEqual('from a');
  expect(readFileSync(join(root, 'b'), 'utf-8')).toEqual('from b');
});

test('dropPageCache succeeds on a readable file', async () => {
  const root = makeTemporaryDirectory();
  writeFileSync(join(root, 'file'), 'contents');

  expect(await dropPageCache(join(root, 'file'))).toEqual(ok());

  // Advisory, not destructive: the file still reads back.
  expect(readFileSync(join(root, 'file'), 'utf-8')).toEqual('contents');
});

test('dropPageCache fails on a file that cannot be opened', async () => {
  const root = makeTemporaryDirectory();

  expect(await dropPageCache(join(root, 'missing'))).toEqual(
    err({ code: 'ENOENT', message: expect.stringContaining('ENOENT') })
  );
});

test('dropPageCache reports a failed fadvise', async () => {
  const root = makeTemporaryDirectory();
  writeFileSync(join(root, 'file'), 'contents');

  // `EBADF` etc. can't happen through this wrapper — it opened the fd itself —
  // so make the addon fail the way a real errno failure would look.
  vi.spyOn(napi, 'fadviseDontNeed').mockImplementation(() => {
    throw new Error('EIO: I/O error');
  });

  expect(await dropPageCache(join(root, 'file'))).toEqual(
    err({ code: 'EIO', message: 'EIO: I/O error' })
  );
});
