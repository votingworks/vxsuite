import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';

import {
  extractErrorMessage,
  isNonExistentFileOrDirectoryError,
} from './errors';

test.each<{ error: unknown; expectedErrorMessage: string }>([
  { error: new Error('Whoa!'), expectedErrorMessage: 'Whoa!' },
  { error: 'Whoa!', expectedErrorMessage: 'Whoa!' },
  { error: Buffer.from('Whoa!', 'utf-8'), expectedErrorMessage: 'Whoa!' },
  { error: 1234, expectedErrorMessage: '1234' },
  { error: { error: 'Whoa!' }, expectedErrorMessage: '[object Object]' },
])('extractErrorMessage', ({ error, expectedErrorMessage }) => {
  expect(extractErrorMessage(error)).toEqual(expectedErrorMessage);
});

test('isNonExistentFileOrDirectoryError', () => {
  const nonExistentFilePath = 'non-existent-file-path';
  expect(fs.existsSync(nonExistentFilePath)).toEqual(false);
  try {
    fs.readFileSync(nonExistentFilePath);
  } catch (error) {
    expect(isNonExistentFileOrDirectoryError(error)).toEqual(true);
  }
  expect(isNonExistentFileOrDirectoryError(new Error('Whoa!'))).toEqual(false);
});
