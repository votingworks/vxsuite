import {
  MAXIMUM_SUPPORTED_NUMBER_FOR_TTS,
  NUMBER_STRINGS_BASE_I18N_KEY,
  generateNumberStringsCatalog,
} from './number_strings';

test('generates entries up to maximum supported number', () => {
  expect(generateNumberStringsCatalog()).toEqual({
    [NUMBER_STRINGS_BASE_I18N_KEY]: expect.objectContaining({
      '0': '0',
      '1': '1',
      '2': '2',
      '3': '3',
      '15': '15',
      '25': '25',
      [MAXIMUM_SUPPORTED_NUMBER_FOR_TTS]: `${MAXIMUM_SUPPORTED_NUMBER_FOR_TTS}`,
    }),
  });
});
