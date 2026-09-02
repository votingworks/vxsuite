import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import path from 'node:path';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { isNonExistentFileOrDirectoryError } from '@votingworks/basics';
import { directoryFileSource, inMemoryFileSource } from './file_source';

test('directoryFileSource reads files relative to the directory', async () => {
  const directoryPath = makeTemporaryDirectory();
  fs.writeFileSync(path.join(directoryPath, 'a.json'), '{}');
  const source = directoryFileSource(directoryPath);
  expect(await source.readFile('a.json')).toEqual(Buffer.from('{}'));
  await expect(source.readFile('missing.json')).rejects.toSatisfy(
    isNonExistentFileOrDirectoryError
  );
});

test('inMemoryFileSource reads from the given files', async () => {
  const source = inMemoryFileSource({ 'a.json': Buffer.from('{}') });
  expect(await source.readFile('a.json')).toEqual(Buffer.from('{}'));
  await expect(source.readFile('missing.json')).rejects.toSatisfy(
    isNonExistentFileOrDirectoryError
  );
});
