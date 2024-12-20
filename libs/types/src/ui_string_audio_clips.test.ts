import { safeParseJson } from './generic';
import { UiStringAudioClipSchema } from './ui_string_audio_clips';

test('valid structure', () => {
  const result = safeParseJson(
    JSON.stringify({
      dataBase64: 'test data',
      id: 'testKey',
      languageCode: 'zh-Hant',
    }),
    UiStringAudioClipSchema
  );

  expect(result.isOk()).toEqual(true);
  expect(result.ok()).toEqual({
    dataBase64: 'test data',
    id: 'testKey',
    languageCode: 'zh-Hant',
  });
});

test('missing field', () => {
  const result = safeParseJson(
    JSON.stringify({
      dataBase64: 'test data',
      languageCode: 'es-US',
    }),
    UiStringAudioClipSchema
  );

  expect(result.isOk()).toEqual(false);
});
