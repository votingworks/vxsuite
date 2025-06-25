import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import JsZip, { JSZipObject } from 'jszip';
import {
  openZip,
  getEntries,
  getEntryStream,
  readEntry,
  readTextEntry,
  readJsonEntry,
  getFilePrefixedByName,
  getFileByName,
  maybeGetFileByName,
} from './file_reading';

// Helper function to create mock JSZipObject entries
function createMockEntry(name: string, date?: Date): JSZipObject {
  const entry: Partial<JSZipObject> = { name };
  if (date) {
    entry.date = date;
  }
  return entry as JSZipObject;
}

test('openZip opens a zip file', async () => {
  const zip = new JsZip();
  zip.file('test.txt', 'Hello World');
  const zipData = await zip.generateAsync({ type: 'uint8array' });

  const result = await openZip(zipData);
  expect(result).toBeInstanceOf(JsZip);
});

test('getEntries returns zip file entries', () => {
  const zip = new JsZip();
  zip.file('test1.txt', 'Content 1');
  zip.file('test2.txt', 'Content 2');

  const entries = getEntries(zip);
  expect(entries).toHaveLength(2);
  expect(entries[0]?.name).toEqual('test1.txt');
  expect(entries[1]?.name).toEqual('test2.txt');
});

test('getEntryStream returns a readable stream', () => {
  const zip = new JsZip();
  zip.file('test.txt', 'Hello World');
  const entries = getEntries(zip);
  const entry = entries[0];

  if (entry) {
    const stream = getEntryStream(entry);
    expect(stream).toBeDefined();
    expect(typeof stream.read).toEqual('function');
  }
});

test('readEntry reads entry content as Buffer', async () => {
  const zip = new JsZip();
  zip.file('test.txt', 'Hello World');
  const entries = getEntries(zip);
  const entry = entries[0];

  if (entry) {
    const result = await readEntry(entry);
    expect(Buffer.isBuffer(result)).toEqual(true);
    expect(result.toString()).toEqual('Hello World');
  }
});

test('readTextEntry reads entry content as string', async () => {
  const zip = new JsZip();
  zip.file('test.txt', 'Hello World');
  const entries = getEntries(zip);
  const entry = entries[0];

  if (entry) {
    const result = await readTextEntry(entry);
    expect(result).toEqual('Hello World');
  }
});

test('readJsonEntry reads entry content as JSON', async () => {
  const testData = { message: 'Hello World', count: 42 } as const;
  const zip = new JsZip();
  zip.file('test.json', JSON.stringify(testData));
  const entries = getEntries(zip);
  const entry = entries[0];

  if (entry) {
    const result = await readJsonEntry(entry);
    expect(result).toEqual(testData);
  }
});

test('getFilePrefixedByName finds file by prefix and extension', () => {
  const entries: JSZipObject[] = [
    createMockEntry('config_v1.json', new Date('2023-01-01')),
    createMockEntry('config_v2.json', new Date('2023-01-02')),
    createMockEntry('data.txt', new Date('2023-01-01')),
  ];

  const result = getFilePrefixedByName(entries, 'config', '.json');
  expect(result.name).toEqual('config_v2.json'); // Most recent
});

test('getFilePrefixedByName throws when no matching file found', () => {
  const entries: JSZipObject[] = [
    createMockEntry('data.txt', new Date('2023-01-01')),
  ];

  expect(() => {
    getFilePrefixedByName(entries, 'config', '.json');
  }).toThrow(
    "Zip object does not have a file starting with 'config' and ending with '.json'"
  );
});

test('getFilePrefixedByName uses custom zip name in error message', () => {
  const entries: JSZipObject[] = [];

  expect(() => {
    getFilePrefixedByName(entries, 'config', '.json', 'Custom Archive');
  }).toThrow(
    "Custom Archive does not have a file starting with 'config' and ending with '.json'"
  );
});

test('getFilePrefixedByName handles files without dates', () => {
  const entries: JSZipObject[] = [
    createMockEntry('config_v1.json'),
    createMockEntry('config_v2.json', new Date('2023-01-02')),
  ];

  const result = getFilePrefixedByName(entries, 'config', '.json');
  expect(result.name).toEqual('config_v2.json'); // One with date wins
});

test('getFileByName finds file by exact name', () => {
  const entries: JSZipObject[] = [
    createMockEntry('config.json'),
    createMockEntry('data.txt'),
  ];

  const result = getFileByName(entries, 'config.json');
  expect(result.name).toEqual('config.json');
});

test('getFileByName throws when file not found', () => {
  const entries: JSZipObject[] = [createMockEntry('data.txt')];

  expect(() => {
    getFileByName(entries, 'config.json');
  }).toThrow("Zip object does not have a file called 'config.json'");
});

test('getFileByName uses custom zip name in error message', () => {
  const entries: JSZipObject[] = [];

  expect(() => {
    getFileByName(entries, 'config.json', 'Custom Archive');
  }).toThrow("Custom Archive does not have a file called 'config.json'");
});

test('maybeGetFileByName returns file when found', () => {
  const entries: JSZipObject[] = [
    createMockEntry('config.json'),
    createMockEntry('data.txt'),
  ];

  const result = maybeGetFileByName(entries, 'config.json');
  expect(result?.name).toEqual('config.json');
});

test('maybeGetFileByName returns undefined when file not found', () => {
  const entries: JSZipObject[] = [createMockEntry('data.txt')];

  const result = maybeGetFileByName(entries, 'config.json');
  expect(result).toBeUndefined();
});
