import { makeTemporaryFile } from '@votingworks/fixtures';
import { assertDefined, range } from '@votingworks/basics';
import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { buffer } from 'node:stream/consumers';
import { getEntries, openZip, readTextEntry } from '@votingworks/utils';
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

test('entry order follows call order for in-memory and path entries', async () => {
  const names = range(0, 20).map((i) => `entry-${i}.txt`);

  const zip = new Archiver();
  for (const [i, name] of names.entries()) {
    if (i % 2 === 0) {
      zip.addEntryFromPath(makeTemporaryFile({ content: name }), { name });
    } else {
      zip.addEntry(name, { name });
    }
  }

  const entries = getEntries(await openZip(await buffer(zip.finalize())));
  expect(entries.map((entry) => entry.name)).toEqual(names);
  const inMemoryEntry = assertDefined(entries[1]);
  for (const entry of entries) {
    expect(await readTextEntry(entry)).toEqual(entry.name);
    expect(entry.date).toEqual(inMemoryEntry.date);
    expect(entry.unixPermissions).toEqual(inMemoryEntry.unixPermissions);
  }
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

test('adds Uint8Array entries that are not Buffers', async () => {
  const zip = new Archiver();
  const contents = new Uint8Array([1, 2, 3, 4]).subarray(1, 3);
  zip.addEntry(contents, { name: 'bytes.bin' });

  const zipContents = await buffer(zip.finalize());
  expect(zipContents.includes(Buffer.from([2, 3]))).toEqual(true);
  expect(zipContents.includes(Buffer.from('bytes.bin'))).toEqual(true);
});
