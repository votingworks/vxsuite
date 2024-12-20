import { safeParseJson } from './generic';
import {
  UiStringAudioIdsPackage,
  UiStringAudioIdsPackageSchema,
} from './ui_string_audio_ids';

test('valid structure', () => {
  const testPackage: UiStringAudioIdsPackage = {
    'es-US': {
      appString: ['a1b2c3', 'f5e6d7'],
      appStringNested: {
        nestedA: ['aaa123'],
        nestedB: ['bbb333'],
      },
    },
    en: {
      appString: ['4f4f4f', '3d3d3d'],
    },
  };

  const result = safeParseJson(
    JSON.stringify(testPackage),
    UiStringAudioIdsPackageSchema
  );

  expect(result.isOk()).toEqual(true);
  expect(result.ok()).toEqual(testPackage);
});

test('invalid values', () => {
  const result = safeParseJson(
    JSON.stringify({
      'es-US': {
        valid: ['a1b2c3', 'f5e6d7'],
        invalid: '4f4f4f',
      },
    }),
    UiStringAudioIdsPackageSchema
  );

  expect(result.isOk()).toEqual(false);
});

test('invalid nesting', () => {
  const result = safeParseJson(
    JSON.stringify({
      'es-US': {
        appString: ['a1b2c3', 'f5e6d7'],
        nested: {
          too: {
            deeply: ['only one level of nesting supported for translations'],
          },
        },
      },
    }),
    UiStringAudioIdsPackageSchema
  );

  expect(result.isOk()).toEqual(false);
});
