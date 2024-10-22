import { isLanguageCode } from './language_code';

test('isLanguageCode', () => {
  expect(isLanguageCode('en')).toEqual(true);
  expect(isLanguageCode('1234')).toEqual(false);
});
