import { expect, test } from 'vitest';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { LocalFileStorageClient } from './file_storage_client.js';

test('LocalFileStorageClient writes and reads files under its root', async () => {
  const root = makeTemporaryDirectory();
  const client = new LocalFileStorageClient(root);

  await client.streamFile('a/b/file.txt', Readable.from(['hello']));
  expect(await readFile(join(root, 'a/b/file.txt'), 'utf-8')).toEqual('hello');

  const contents = (await client.readFile('a/b/file.txt')).unsafeUnwrap();
  expect(await text(contents)).toEqual('hello');
});

test('LocalFileStorageClient rejects paths outside its root', async () => {
  const client = new LocalFileStorageClient(makeTemporaryDirectory());

  expect(() => client.readFile('jurisdiction-1/../../outside.txt')).toThrow(
    'file path escapes storage root'
  );
  await expect(
    client.streamFile('../outside.txt', Readable.from('contents'))
  ).rejects.toThrow('file path escapes storage root');
  expect(() => client.readFile('.')).toThrow('file path escapes storage root');
});
