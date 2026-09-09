import { makeTemporaryFile } from '@votingworks/fixtures';
import { expect, test } from 'vitest';
import { buffer } from 'node:stream/consumers';
import { Archiver } from './zip.js';

// Success cases tested via app/worker test paths.

test('reports file read warnings as errors', async () => {
  const realFilePath = makeTemporaryFile({ content: 'exists' });
  const missingFilePath = '/does/not/exist';

  const zip = new Archiver();
  zip.addEntryFromPath(realFilePath, { name: 'exists.txt' });
  zip.addEntryFromPath(missingFilePath, { name: 'missing.txt' });

  await expect(() => buffer(zip.finalize())).rejects.toThrow('ENOENT');
});

test('reports errors on double finalize', async () => {
  const zip = new Archiver();
  const filePath = makeTemporaryFile({ content: 'foo' });
  zip.addEntryFromPath(filePath, { name: 'foo.txt' });

  zip.finalize();
  await expect(() => buffer(zip.finalize())).rejects.toThrow();
});
