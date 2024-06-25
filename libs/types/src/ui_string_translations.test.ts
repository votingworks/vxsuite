import { safeParseJson } from './generic';
import { LanguageCode } from './language_code';
import {
  UiStringsPackage,
  UiStringsPackageSchema,
  filterUiStrings,
  mergeUiStrings,
} from './ui_string_translations';

test('valid structure', () => {
  const testPackage: UiStringsPackage = {
    [LanguageCode.SPANISH]: {
      appString: 'ES app string translation',
      appStringNested: {
        nestedA: 'nested app string translation A',
        nestedB: 'nested app string translation B',
      },
    },
    [LanguageCode.ENGLISH]: {
      appString: 'EN app string translation',
    },
  };

  const result = safeParseJson(
    JSON.stringify(testPackage),
    UiStringsPackageSchema
  );

  expect(result.isOk()).toEqual(true);
  expect(result.ok()).toEqual(testPackage);
});

test('invalid language code', () => {
  const result = safeParseJson(
    JSON.stringify({
      [LanguageCode.SPANISH]: {
        appString: 'ES app string translation',
      },
      Klingon: {
        appString: 'Klingon app string translation',
      },
    }),
    UiStringsPackageSchema
  );

  expect(result.isOk()).toEqual(false);
});

test('invalid structure', () => {
  const result = safeParseJson(
    JSON.stringify({
      [LanguageCode.SPANISH]: {
        appString: 'ES app string translation',
        nested: {
          too: {
            deeply: 'only one level of nesting supported for translations',
          },
        },
      },
    }),
    UiStringsPackageSchema
  );

  expect(result.isOk()).toEqual(false);
});

test('mergeUiStrings', () => {
  const strings1: UiStringsPackage = {
    [LanguageCode.ENGLISH]: {
      appString: 'EN app string translation',
      appString2: 'EN app string 2 translation',
    },
    [LanguageCode.SPANISH]: {
      appString: 'ES app string translation',
    },
  };

  const strings2: UiStringsPackage = {
    [LanguageCode.ENGLISH]: {
      appString: 'EN app string translation 2',
      appString3: 'EN app string 3 translation 2',
    },
  };

  expect(mergeUiStrings(strings1, strings2)).toEqual({
    [LanguageCode.ENGLISH]: {
      appString: 'EN app string translation 2',
      appString2: 'EN app string 2 translation',
      appString3: 'EN app string 3 translation 2',
    },
    [LanguageCode.SPANISH]: {
      appString: 'ES app string translation',
    },
  });
});

test('filterUiStrings', () => {
  const strings: UiStringsPackage = {
    [LanguageCode.ENGLISH]: {
      appString: 'EN app string translation',
      appString2: 'EN app string 2 translation',
    },
    [LanguageCode.SPANISH]: {
      appString: 'ES app string translation',
    },
  };

  expect(filterUiStrings(strings, (key) => key === 'appString')).toEqual({
    [LanguageCode.ENGLISH]: {
      appString: 'EN app string translation',
    },
    [LanguageCode.SPANISH]: {
      appString: 'ES app string translation',
    },
  });
});
