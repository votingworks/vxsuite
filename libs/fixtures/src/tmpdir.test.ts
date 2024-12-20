import { afterEach, expect, test } from 'vitest';
import {
  clearTemporaryRootDir,
  getPathForFile,
  getTemporaryRootDir,
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
