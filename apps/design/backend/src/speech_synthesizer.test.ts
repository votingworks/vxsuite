import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';

import {
  GoogleCloudVoices,
  mockCloudSynthesizedSpeech,
  makeMockGoogleCloudTextToSpeechClient,
} from '@votingworks/backend';
import { LanguageCode } from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import { GoogleCloudSpeechSynthesizerWithDbCache } from './speech_synthesizer';
import { TestStore } from '../test/test_store';

const logger = mockBaseLogger({ fn: vi.fn });
const testStore = new TestStore(logger);

beforeEach(async () => {
  await testStore.init();
});

afterAll(async () => {
  await testStore.cleanUp();
});

test('GoogleCloudSpeechSynthesizerWithDbCache', async () => {
  const store = testStore.getStore();
  const textToSpeechClient = makeMockGoogleCloudTextToSpeechClient({
    fn: vi.fn,
  });
  const speechSynthesizer = new GoogleCloudSpeechSynthesizerWithDbCache({
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
