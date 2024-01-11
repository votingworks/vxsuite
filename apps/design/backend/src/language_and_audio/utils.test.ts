import { LanguageCode, UiStringsPackage } from '@votingworks/types';

import { setUiString } from './utils';

test('setUiString', () => {
  const uiStrings: UiStringsPackage = {};

  setUiString(uiStrings, LanguageCode.ENGLISH, 'A', 'One');
  setUiString(uiStrings, LanguageCode.ENGLISH, ['B', 'C'], 'Two');
  setUiString(uiStrings, LanguageCode.ENGLISH, ['B', 'D'], 'Three');
  setUiString(uiStrings, LanguageCode.SPANISH, 'A', 'Uno');
  setUiString(uiStrings, LanguageCode.SPANISH, ['B', 'C'], 'Dos');
  setUiString(uiStrings, LanguageCode.SPANISH, ['B', 'D'], 'Tres');

  expect(uiStrings).toEqual({
    [LanguageCode.ENGLISH]: {
      A: 'One',
      B: {
        C: 'Two',
        D: 'Three',
      },
    },
    [LanguageCode.SPANISH]: {
      A: 'Uno',
      B: {
        C: 'Dos',
        D: 'Tres',
      },
    },
  });
});
