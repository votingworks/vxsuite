import { Buffer } from 'node:buffer';
import {
  TextToSpeechClient as GoogleCloudTextToSpeechClient,
  protos,
} from '@google-cloud/text-to-speech';
import { assertDefined } from '@votingworks/basics';

import { LanguageCode } from '@votingworks/types';
import { convertHtmlToAudioCues } from './rich_text';

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
export interface MinimalGoogleCloudTextToSpeechClient {
  synthesizeSpeech(
    request: protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest
  ): Promise<
    [
      protos.google.cloud.texttospeech.v1.ISynthesizeSpeechResponse,
      protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest | undefined,
      unknown,
    ]
  >;
}

/**
 * Interface for synthesizing speech.
 */
export interface SpeechSynthesizer {
  synthesizeSpeech(text: string, languageCode: LanguageCode): Promise<string>;
}

/**
 * Base class for synthesizing speech using Google Cloud Text-to-Speech.
 * Does not cache synthesized speech. Sub classes should implement caching.
 * Provides a method for synthesizing speech from text with the google cloud client provided.
 */
export class GoogleCloudSpeechSynthesizer implements SpeechSynthesizer {
  private readonly textToSpeechClient: MinimalGoogleCloudTextToSpeechClient;

  constructor(input: {
    // Support providing a mock client for tests
    textToSpeechClient?: MinimalGoogleCloudTextToSpeechClient;
  }) {
    this.textToSpeechClient =
      input.textToSpeechClient ??
      /* istanbul ignore next */ new GoogleCloudTextToSpeechClient();
  }

  async synthesizeSpeech(
    text: string,
    languageCode: LanguageCode
  ): Promise<string> {
    const sanitizedText = convertHtmlToAudioCues(text);
    return await this.synthesizeSpeechSanitized(sanitizedText, languageCode);
  }

  protected async synthesizeSpeechSanitized(
    sanitizedText: string,
    languageCode: LanguageCode
  ): Promise<string> {
    return await this.synthesizeSpeechWithGoogleCloud(
      sanitizedText,
      languageCode
    );
  }

  protected async synthesizeSpeechWithGoogleCloud(
    sanitizedText: string,
    languageCode: LanguageCode
  ): Promise<string> {
    const [response] = await this.textToSpeechClient.synthesizeSpeech({
      audioConfig: { audioEncoding: 'MP3' },
      input: { text: sanitizedText },
      voice: GoogleCloudVoices[languageCode],
    });
    const audioClipBase64 = Buffer.from(
      assertDefined(response.audioContent)
    ).toString('base64');
    return audioClipBase64;
  }
}
