import { safeParseJson } from './generic';
import { LanguageCode } from './language_code';
import { UiStringAudioClipSchema } from './ui_string_audio_clips';

test('valid structure', () => {
  const result = safeParseJson(
    JSON.stringify({
      data: 'test data',
      key: 'testKey',
      lang: LanguageCode.CHINESE,
    }),
    UiStringAudioClipSchema
  );

  expect(result.isOk()).toEqual(true);
  expect(result.ok()).toEqual({
    data: 'test data',
    key: 'testKey',
    lang: LanguageCode.CHINESE,
  });
});

test('invalid language code', () => {
  const result = safeParseJson(
    JSON.stringify({
      data: 'test data',
      key: 'testKey',
      lang: 'Klingon',
    }),
    UiStringAudioClipSchema
  );

  expect(result.isOk()).toEqual(false);
});

test('missing field', () => {
  const result = safeParseJson(
    JSON.stringify({
      data: 'test data',
      lang: LanguageCode.SPANISH,
    }),
    UiStringAudioClipSchema
  );

  expect(result.isOk()).toEqual(false);
});
