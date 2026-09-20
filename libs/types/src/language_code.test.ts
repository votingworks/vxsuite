import { expect, test } from 'vitest';
import { isLanguageCode } from './language_code.js';

test('isLanguageCode', () => {
  expect(isLanguageCode('en')).toEqual(true);
  expect(isLanguageCode('1234')).toEqual(false);
});
