import { safeParseJson } from './generic';
import { LanguageCode } from './language_code';
import { UiStringAudioClipSchema } from './ui_string_audio_clips';

test('valid structure', () => {
  const result = safeParseJson(
    JSON.stringify({
      dataBase64: 'test data',
      id: 'testKey',
      languageCode: LanguageCode.CHINESE_TRADITIONAL,
    }),
    UiStringAudioClipSchema
  );

  expect(result.isOk()).toEqual(true);
  expect(result.ok()).toEqual({
    dataBase64: 'test data',
    id: 'testKey',
    languageCode: LanguageCode.CHINESE_TRADITIONAL,
  });
});

test('invalid language code', () => {
  const result = safeParseJson(
    JSON.stringify({
      dataBase64: 'test data',
      id: 'testKey',
      languageCode: 'Klingon',
    }),
    UiStringAudioClipSchema
  );

  expect(result.isOk()).toEqual(false);
});

test('missing field', () => {
  const result = safeParseJson(
    JSON.stringify({
      dataBase64: 'test data',
      languageCode: LanguageCode.SPANISH,
    }),
    UiStringAudioClipSchema
  );

  expect(result.isOk()).toEqual(false);
});
