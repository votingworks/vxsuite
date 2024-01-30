import {
  MAXIMUM_SUPPORTED_NUMBER_FOR_TTS,
  generateNumberStringsCatalog,
  getI18nKeyForNumber,
} from './number_strings';

test('generates entries up to maximum supported number', () => {
  const maxNumber = MAXIMUM_SUPPORTED_NUMBER_FOR_TTS;

  expect(generateNumberStringsCatalog()).toEqual(
    expect.objectContaining({
      [getI18nKeyForNumber(0)]: '0',
      [getI18nKeyForNumber(1)]: '1',
      [getI18nKeyForNumber(2)]: '2',
      [getI18nKeyForNumber(3)]: '3',
      [getI18nKeyForNumber(15)]: '15',
      [getI18nKeyForNumber(25)]: '25',
      [getI18nKeyForNumber(maxNumber)]: `${maxNumber}`,
    })
  );
});
