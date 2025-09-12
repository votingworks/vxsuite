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
import { MAX_POSTGRES_INDEX_KEY_BYTES } from './globals';

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

test('GoogleCloudSpeechSynthesizerWithDbCache does not cache extremely large strings', async () => {
  const store = testStore.getStore();
  const textToSpeechClient = makeMockGoogleCloudTextToSpeechClient({
    fn: vi.fn,
  });
  const speechSynthesizer = new GoogleCloudSpeechSynthesizerWithDbCache({
    store,
    textToSpeechClient,
  });

  const largeString = `Large string: ${'x'.repeat(
    MAX_POSTGRES_INDEX_KEY_BYTES
  )}`;
  const smallString = 'Small string';

  // First synthesis, both strings get synthesized
  let audioClipBase64 = await speechSynthesizer.synthesizeSpeech(
    largeString,
    LanguageCode.ENGLISH
  );
  expect(Buffer.from(audioClipBase64, 'base64').toString('utf-8')).toEqual(
    mockCloudSynthesizedSpeech(largeString)
  );
  expect(textToSpeechClient.synthesizeSpeech).toHaveBeenCalledTimes(1);

  audioClipBase64 = await speechSynthesizer.synthesizeSpeech(
    smallString,
    LanguageCode.ENGLISH
  );
  expect(Buffer.from(audioClipBase64, 'base64').toString('utf-8')).toEqual(
    mockCloudSynthesizedSpeech(smallString)
  );
  expect(textToSpeechClient.synthesizeSpeech).toHaveBeenCalledTimes(2);

  textToSpeechClient.synthesizeSpeech.mockClear();

  // Second synthesis, large string gets synthesized again, small string should be cached
  audioClipBase64 = await speechSynthesizer.synthesizeSpeech(
    largeString,
    LanguageCode.ENGLISH
  );
  expect(Buffer.from(audioClipBase64, 'base64').toString('utf-8')).toEqual(
    mockCloudSynthesizedSpeech(largeString)
  );
  expect(textToSpeechClient.synthesizeSpeech).toHaveBeenCalledTimes(1);

  audioClipBase64 = await speechSynthesizer.synthesizeSpeech(
    smallString,
    LanguageCode.ENGLISH
  );
  expect(Buffer.from(audioClipBase64, 'base64').toString('utf-8')).toEqual(
    mockCloudSynthesizedSpeech(smallString)
  );
  // Small string was cached, no additional call
  expect(textToSpeechClient.synthesizeSpeech).toHaveBeenCalledTimes(1);
});
