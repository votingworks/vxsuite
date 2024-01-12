import { LanguageCode, isLanguageCode } from './language_code';

test('isLanguageCode', () => {
  expect(isLanguageCode(LanguageCode.ENGLISH)).toEqual(true);
  expect(isLanguageCode('1234')).toEqual(false);
});
