import { Buffer } from 'buffer';
import { LanguageCode } from '@votingworks/types';

import {
  mockCloudSynthesizedSpeech,
  MockGoogleCloudTextToSpeechClient,
} from '../../test/helpers';
import { Store } from '../store';
import {
  GoogleCloudSpeechSynthesizer,
  GoogleCloudVoices,
} from './speech_synthesizer';

test('GoogleCloudSpeechSynthesizer', async () => {
  const store = Store.memoryStore();
  const textToSpeechClient = new MockGoogleCloudTextToSpeechClient();
  const speechSynthesizer = new GoogleCloudSpeechSynthesizer({
    store,
    textToSpeechClient,
  });

  let audioClipBase64 = await speechSynthesizer.synthesizeSpeech(
    'Do you like apples?',
    LanguageCode.ENGLISH
  );
  expect(Buffer.from(audioClipBase64, 'base64').toString('utf-8')).toEqual(
    mockCloudSynthesizedSpeech('Do you like apples?')
  );
  expect(textToSpeechClient.synthesizeSpeech).toHaveBeenCalledTimes(1);
  expect(textToSpeechClient.synthesizeSpeech).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      input: { text: 'Do you like apples?' },
      voice: GoogleCloudVoices[LanguageCode.ENGLISH],
    })
  );
  textToSpeechClient.synthesizeSpeech.mockClear();

  // Expect a cache hit
  audioClipBase64 = await speechSynthesizer.synthesizeSpeech(
    'Do you like apples?',
    LanguageCode.ENGLISH
  );
  expect(Buffer.from(audioClipBase64, 'base64').toString('utf-8')).toEqual(
    mockCloudSynthesizedSpeech('Do you like apples?')
  );
  expect(textToSpeechClient.synthesizeSpeech).not.toHaveBeenCalled();
});
