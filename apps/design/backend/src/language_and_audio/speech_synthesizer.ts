import { Buffer } from 'buffer';
import { TextToSpeechClient as GoogleCloudTextToSpeechClient } from '@google-cloud/text-to-speech';
import { assertDefined } from '@votingworks/basics';
import { LanguageCode } from '@votingworks/types';

import { Store } from '../store';

export interface SpeechSynthesizer {
  synthesizeSpeech(text: string, languageCode: LanguageCode): Promise<string>;
}

/**
 * Available voices are listed at https://cloud.google.com/text-to-speech/docs/voices.
 *
 * TODO: Decide which voices we want to use.
 */
export const GoogleCloudVoices: Record<
  LanguageCode,
  { languageCode: string; name: string }
> = {
  [LanguageCode.CHINESE_SIMPLIFIED]: {
    languageCode: 'cmn-CN',
    name: 'cmn-CN-Wavenet-B',
  },
  [LanguageCode.CHINESE_TRADITIONAL]: {
    languageCode: 'cmn-CN',
    name: 'cmn-CN-Wavenet-B',
  },
  [LanguageCode.ENGLISH]: { languageCode: 'en-US', name: 'en-US-Neural2-J' },
  [LanguageCode.SPANISH]: { languageCode: 'es-US', name: 'es-US-Neural2-B' },
};

/**
 * The subset of {@link GoogleCloudTextToSpeechClient} that we actually use
 */
export type MinimalGoogleCloudTextToSpeechClient = Pick<
  GoogleCloudTextToSpeechClient,
  'synthesizeSpeech'
>;

/**
 * An implementation of {@link SpeechSynthesizer} that uses the Google Cloud Text-to-Speech API
 */
export class GoogleCloudSpeechSynthesizer implements SpeechSynthesizer {
  private readonly store: Store;
  private readonly textToSpeechClient: MinimalGoogleCloudTextToSpeechClient;

  constructor(input: {
    store: Store;
    // Support providing a mock client for tests
    textToSpeechClient?: MinimalGoogleCloudTextToSpeechClient;
  }) {
    this.store = input.store;
    this.textToSpeechClient =
      input.textToSpeechClient ??
      /* istanbul ignore next */ new GoogleCloudTextToSpeechClient();
  }

  async synthesizeSpeech(
    text: string,
    languageCode: LanguageCode
  ): Promise<string> {
    const audioClipBase64FromCache = this.store.getAudioClipBase64FromCache({
      languageCode,
      text,
    });
    if (audioClipBase64FromCache) {
      return audioClipBase64FromCache;
    }

    const audioClipBase64 = await this.synthesizeSpeechWithGoogleCloud(
      text,
      languageCode
    );
    this.store.addSpeechSynthesisCacheEntry({
      languageCode,
      text,
      audioClipBase64,
    });
    return audioClipBase64;
  }

  private async synthesizeSpeechWithGoogleCloud(
    text: string,
    languageCode: LanguageCode
  ): Promise<string> {
    const [response] = await this.textToSpeechClient.synthesizeSpeech({
      audioConfig: { audioEncoding: 'MP3' },
      input: { text },
      voice: GoogleCloudVoices[languageCode],
    });
    const audioClipBase64 = Buffer.from(
      assertDefined(response.audioContent)
    ).toString('base64');
    return audioClipBase64;
  }
}
