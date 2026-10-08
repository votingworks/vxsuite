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

test('with entry compression enabled', async () => {
  const entry1 = 'one'.repeat(256);
  const entry2 = 'two';

  function makeZip(compressEntry1: boolean) {
    const zip = new Archiver();
    zip.addEntry(entry1, { name: 'one.txt', compress: compressEntry1 });
    zip.addEntry(entry2, { name: 'two.txt' });
    return buffer(zip.finalize());
  }

  const zipUncompressed = await makeZip(false);
  const zipCompressed = await makeZip(true);
  expect(zipCompressed.byteLength).toBeLessThan(zipUncompressed.byteLength);
});

test('consistent output across multiple runs with compressed entries', async () => {
  const entry1 = 'one'.repeat(256);
  const entry2 = 'two';

  function makeZip() {
    const zip = new Archiver();
    zip.addEntry(entry1, { name: 'one.txt', compress: true });
    zip.addEntry(entry2, { name: 'two.txt' });
    return buffer(zip.finalize());
  }

  const zipData1 = await makeZip();
  const zipData2 = await makeZip();
  expect(zipData1.equals(zipData2)).toBeTruthy();
});
