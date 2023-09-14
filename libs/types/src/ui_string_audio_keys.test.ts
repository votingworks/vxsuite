import { safeParseJson } from './generic';
import { LanguageCode } from './language_code';
import {
  UiStringAudioKeysPackage,
  UiStringAudioKeysPackageSchema,
} from './ui_string_audio_keys';

test('valid structure', () => {
  const testPackage: UiStringAudioKeysPackage = {
    [LanguageCode.SPANISH]: {
      appString: ['a1b2c3', 'f5e6d7'],
      appStringNested: {
        nestedA: ['aaa123'],
        nestedB: ['bbb333'],
      },
    },
    [LanguageCode.ENGLISH]: {
      appString: ['4f4f4f', '3d3d3d'],
    },
  };

  const result = safeParseJson(
    JSON.stringify(testPackage),
    UiStringAudioKeysPackageSchema
  );

  expect(result.isOk()).toEqual(true);
  expect(result.ok()).toEqual(testPackage);
});

test('invalid language code', () => {
  const result = safeParseJson(
    JSON.stringify({
      [LanguageCode.SPANISH]: {
        appString: ['a1b2c3', 'f5e6d7'],
      },
      Klingon: {
        appString: ['4f4f4f', '3d3d3d'],
      },
    }),
    UiStringAudioKeysPackageSchema
  );

  expect(result.isOk()).toEqual(false);
});

test('invalid values', () => {
  const result = safeParseJson(
    JSON.stringify({
      [LanguageCode.SPANISH]: {
        valid: ['a1b2c3', 'f5e6d7'],
        invalid: '4f4f4f',
      },
    }),
    UiStringAudioKeysPackageSchema
  );

  expect(result.isOk()).toEqual(false);
});

test('invalid nesting', () => {
  const result = safeParseJson(
    JSON.stringify({
      [LanguageCode.SPANISH]: {
        appString: ['a1b2c3', 'f5e6d7'],
        nested: {
          too: {
            deeply: ['only one level of nesting supported for translations'],
          },
        },
      },
    }),
    UiStringAudioKeysPackageSchema
  );

  expect(result.isOk()).toEqual(false);
});
