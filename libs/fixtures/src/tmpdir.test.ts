import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { afterEach, expect, test } from 'vitest';
import {
  clearTemporaryRootDir,
  getPathForFile,
  getTemporaryRootDir,
  makeTemporaryDirectory,
  makeTemporaryFile,
  makeTemporaryFileAsync,
  makeTemporaryPath,
  setTemporaryRootDir,
  setupTemporaryRootDir,
} from './tmpdir';

afterEach(clearTemporaryRootDir);

test('getTemporaryRootDir throws when unset', () => {
  expect(() => getTemporaryRootDir()).toThrow();
});

test('getTemporaryRootDir returns the temporary root directory', () => {
  setTemporaryRootDir('tmp');
  expect(getTemporaryRootDir()).toEqual('tmp');
});

test('setTemporaryRootDir throws when called twice', () => {
  setTemporaryRootDir('tmp');
  expect(() => setTemporaryRootDir('tmp')).toThrow();
});

test('setTemporaryRootDir throws when called after setupTemporaryRootDir', () => {
  setupTemporaryRootDir();
  expect(() => setTemporaryRootDir('tmp')).toThrow();
});

test('getPathForFile throws when temporary root directory is unset', () => {
  expect(() => getPathForFile('file')).toThrow();
});

test('getPathForFile returns the path to a file in the temporary root directory', () => {
  setTemporaryRootDir('tmp');
  expect(getPathForFile('file')).toEqual('tmp/file');
});

test('makeTemporaryPath makes a path but does not create anything at that path', () => {
  setTemporaryRootDir('tmp');
  const path = makeTemporaryPath();
  expect(path).toMatch(/tmp\/.*/);
  expect(existsSync(path)).toBeFalsy();
});

test('makeTemporaryDirectory makes a directory at a temporary path', () => {
  setupTemporaryRootDir();
  const path = makeTemporaryDirectory();
  expect(path).toMatch(/tmp\/.*/);
  expect(statSync(path).isDirectory()).toBeTruthy();
});

test('makeTemporaryFile makes a file at a temporary path', () => {
  setupTemporaryRootDir();

  const path = makeTemporaryFile();
  expect(path).toMatch(/tmp\/.*/);
  expect(statSync(path).isFile()).toBeTruthy();
  expect(readFileSync(path)).toEqual(Buffer.of());

  const pathWithStringContent = makeTemporaryFile({ content: 'abc' });
  expect(pathWithStringContent).toMatch(/tmp\/.*/);
  expect(statSync(pathWithStringContent).isFile()).toBeTruthy();
  expect(readFileSync(pathWithStringContent, 'utf-8')).toEqual('abc');

  const pathWithBinaryContent = makeTemporaryFile({
    content: Buffer.of(1, 2, 3),
  });
  expect(pathWithBinaryContent).toMatch(/tmp\/.*/);
  expect(statSync(pathWithBinaryContent).isFile()).toBeTruthy();
  expect(readFileSync(pathWithBinaryContent)).toEqual(Buffer.of(1, 2, 3));
});

test('makeTemporaryFileAsync makes a file at a temporary path', async () => {
  setupTemporaryRootDir();

  const path = await makeTemporaryFileAsync();
  expect(path).toMatch(/tmp\/.*/);
  expect(statSync(path).isFile()).toBeTruthy();
  expect(readFileSync(path)).toEqual(Buffer.of());

  const pathWithStringContent = await makeTemporaryFileAsync({
    content: 'abc',
  });
  expect(pathWithStringContent).toMatch(/tmp\/.*/);
  expect(statSync(pathWithStringContent).isFile()).toBeTruthy();
  expect(readFileSync(pathWithStringContent, 'utf-8')).toEqual('abc');

  const pathWithBinaryContent = await makeTemporaryFileAsync({
    content: Buffer.of(1, 2, 3),
  });
  expect(pathWithBinaryContent).toMatch(/tmp\/.*/);
  expect(statSync(pathWithBinaryContent).isFile()).toBeTruthy();
  expect(readFileSync(pathWithBinaryContent)).toEqual(Buffer.of(1, 2, 3));

  const pathWithAsyncIteratorContent = await makeTemporaryFileAsync({
    content: (async function* content() {
      yield Buffer.of(1);
      yield Buffer.of(await Promise.resolve(2));
      yield Buffer.of(3);
    })(),
  });
  expect(pathWithAsyncIteratorContent).toMatch(/tmp\/.*/);
  expect(statSync(pathWithAsyncIteratorContent).isFile()).toBeTruthy();
  expect(readFileSync(pathWithAsyncIteratorContent)).toEqual(
    Buffer.of(1, 2, 3)
  );
});

test.each([
  { fn: makeTemporaryPath, name: 'makeTemporaryPath' },
  { fn: makeTemporaryDirectory, name: 'makeTemporaryDirectory' },
  { fn: makeTemporaryFile, name: 'makeTemporaryFile' },
  { fn: makeTemporaryFileAsync, name: 'makeTemporaryFileAsync' },
])('$name prefix + postfix', async ({ fn }) => {
  setupTemporaryRootDir();
  const prefixPath = await fn({ prefix: 'abc' });
  expect(prefixPath).toMatch(/\/abc.*/);
  const postfixPath = await fn({ postfix: '.pdf' });
  expect(postfixPath).toMatch(/\/.*\.pdf$/);
  const prefixPostfixPath = await fn({
    prefix: 'abc',
    postfix: '.pdf',
  });
  expect(prefixPostfixPath).toMatch(/\/abc.*\.pdf$/);
});
