import { Buffer } from 'node:buffer';

import {
  mockCloudSynthesizedSpeech,
  MockGoogleCloudTextToSpeechClient,
} from '../../test/helpers';
import { Store } from '../store';
import {
  convertHtmlToAudioCues,
  GoogleCloudSpeechSynthesizer,
  GoogleCloudVoices,
} from './speech_synthesizer';
import { LanguageCode } from '../language_code';

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

test('convertHtmlToAudioCues', () => {
  expect(convertHtmlToAudioCues('This is HTML text')).toEqual(
    'This is HTML text'
  );
  expect(convertHtmlToAudioCues('<p>This is HTML text</p>')).toEqual(
    'This is HTML text'
  );
  expect(
    convertHtmlToAudioCues('<p>This is <s>Markdown</s> HTML text</p>')
  ).toEqual(
    'This is [begin strikethrough] Markdown [end strikethrough] HTML text'
  );
  expect(convertHtmlToAudioCues('<p>This is <u>HTML</u> text</p>')).toEqual(
    'This is [begin underline] HTML [end underline] text'
  );

  expect(
    convertHtmlToAudioCues(
      `This is a list:
<ol> <li>Item 1</li><li>Item 2</li><li>Item 3</li></ol>`
    )
  ).toEqual(`This is a list:
 1. Item 1
2. Item 2
3. Item 3
`);

  expect(convertHtmlToAudioCues('This is an image: <img src="src" >')).toEqual(
    'This is an image: [image]'
  );
});
