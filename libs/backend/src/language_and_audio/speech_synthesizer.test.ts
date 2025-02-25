import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';

import { LanguageCode } from '@votingworks/types';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudVoices,
} from './speech_synthesizer';
import {
  makeMockGoogleCloudTextToSpeechClient,
  mockCloudSynthesizedSpeech,
} from './test_utils';

vi.mock(import('./rich_text.js'), () => ({
  convertHtmlToAudioCues: vi.fn((text) => `[sanitized] ${text}`),
}));

test('GoogleCloudSpeechSynthesizerWithDbCache', async () => {
  const textToSpeechClient = makeMockGoogleCloudTextToSpeechClient({
    fn: vi.fn,
  });
  const speechSynthesizer = new GoogleCloudSpeechSynthesizer({
    textToSpeechClient,
  });

  const audioClipBase64 = await speechSynthesizer.synthesizeSpeech(
    'Do you like apples?',
    LanguageCode.ENGLISH
  );
  expect(Buffer.from(audioClipBase64, 'base64').toString('utf-8')).toEqual(
    mockCloudSynthesizedSpeech('[sanitized] Do you like apples?')
  );
  expect(textToSpeechClient.synthesizeSpeech).toHaveBeenCalledTimes(1);
  expect(textToSpeechClient.synthesizeSpeech).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      input: { text: '[sanitized] Do you like apples?' },
      voice: GoogleCloudVoices[LanguageCode.ENGLISH],
    })
  );
  textToSpeechClient.synthesizeSpeech.mockClear();
});
