import { safeParseJson } from './generic';
import { LanguageCode } from './language_code';
import {
  UiStringsPackage,
  UiStringsPackageSchema,
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
