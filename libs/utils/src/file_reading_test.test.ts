import { Buffer } from 'buffer';
import JsZip from 'jszip';
import {
  getEntries,
  getFileByName,
  maybeGetFileByName,
  openZip,
  readEntry,
  readFile,
  readFileAsyncAsString,
  readJsonEntry,
  readTextEntry,
} from './file_reading';

test('readFileAsyncAsString', async () => {
  const file = new File(['hello'], 'hello.txt');
  expect(await readFileAsyncAsString(file)).toEqual('hello');
});

test('readFileAsyncAsString empty', async () => {
  const file = new File([], 'empty.txt');
  expect(await readFileAsyncAsString(file)).toEqual('');
});

test('readFileAsyncAsString error', async () => {
  jest.spyOn(FileReader.prototype, 'readAsText').mockImplementation(() => {
    throw new Error('read error');
  });

  const file = new File(['hello'], 'hello.txt');
  await expect(readFileAsyncAsString(file)).rejects.toThrow('read error');
});

test('readFile', async () => {
  const file = new File(['hello'], 'hello.txt');
  const buffer = await readFile(file);
  expect(buffer).toEqual(Buffer.from('hello'));
});

test('readFile empty', async () => {
  const file = new File([], 'empty.txt');
  const buffer = await readFile(file);
  expect(buffer).toEqual(Buffer.from([]));
});

test('readFile error', async () => {
  jest
    .spyOn(FileReader.prototype, 'readAsArrayBuffer')
    .mockImplementation(() => {
      throw new Error('read error');
    });

  const file = new File(['hello'], 'hello.txt');
  await expect(readFile(file)).rejects.toThrow('read error');
});

test('openZip', async () => {
  const zip = new JsZip();
  zip.file('hello.txt', 'hello');
  zip.file('test.json', JSON.stringify({ test: true }));
  const data = await zip.generateAsync({ type: 'uint8array' });

  const newZip = await openZip(data);
  const entries = getEntries(newZip);
  expect(entries.map((entry) => entry.name)).toEqual([
    'hello.txt',
    'test.json',
  ]);
  await expect(readEntry(getFileByName(entries, 'hello.txt'))).resolves.toEqual(
    Buffer.from('hello')
  );
  await expect(
    readTextEntry(getFileByName(entries, 'hello.txt'))
  ).resolves.toEqual('hello');
  await expect(
    readJsonEntry(getFileByName(entries, 'test.json'))
  ).resolves.toEqual({
    test: true,
  });

  expect(maybeGetFileByName(entries, 'missing.txt')).toBeUndefined();
  expect(maybeGetFileByName(entries, 'hello.txt')).toEqual(
    getFileByName(entries, 'hello.txt')
  );
  expect(() => getFileByName(entries, 'missing.txt')).toThrowError();
});
