import { expect, test } from 'vitest';
import { err, ok } from '@votingworks/basics';
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

  expect(result).toEqual(
    ok({
      dataBase64: 'test data',
      id: 'testKey',
      languageCode: 'zh-Hant',
    })
  );
});

test('missing field', () => {
  const result = safeParseJson(
    JSON.stringify({
      dataBase64: 'test data',
      languageCode: 'es-US',
    }),
    UiStringAudioClipSchema
  );

  expect(result).toEqual(err(expect.anything()));
});
