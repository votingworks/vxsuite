import { Buffer } from 'node:buffer';
import {
  TextToSpeechClient as GoogleCloudTextToSpeechClient,
  protos,
} from '@google-cloud/text-to-speech';
import { assert } from '@votingworks/basics';

import { LanguageCode, PhoneticWord, ssmlGenerate } from '@votingworks/types';
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
  fromSsml(ssml: PhoneticWord[], languageCode: LanguageCode): Promise<string>;
  fromText(text: string, languageCode: LanguageCode): Promise<string>;
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
      /* istanbul ignore next - @preserve */ new GoogleCloudTextToSpeechClient();
  }

  async fromSsml(
    words: PhoneticWord[],
    languageCode: LanguageCode
  ): Promise<string> {
    return await this.fromSsmlString(ssmlGenerate(words), languageCode);
  }

  async fromText(text: string, languageCode: LanguageCode): Promise<string> {
    const sanitizedText = convertHtmlToAudioCues(text);
    return await this.fromTextSanitized(sanitizedText, languageCode);
  }

  protected async fromSsmlString(
    ssml: string,
    languageCode: LanguageCode
  ): Promise<string> {
    return await this.fromSsmlWithGoogleCloud(ssml, languageCode);
  }

  protected async fromTextSanitized(
    sanitizedText: string,
    languageCode: LanguageCode
  ): Promise<string> {
    return await this.fromTextWithGoogleCloud(sanitizedText, languageCode);
  }

  protected async fromTextWithGoogleCloud(
    sanitizedText: string,
    languageCode: LanguageCode
  ): Promise<string> {
    const [response] = await this.textToSpeechClient.synthesizeSpeech({
      audioConfig: { audioEncoding: 'MP3' },
      input: { text: sanitizedText },
      voice: GoogleCloudVoices[languageCode],
    });

    assert(response.audioContent instanceof Uint8Array);

    return Buffer.from(response.audioContent.buffer).toString('base64');
  }

  protected async fromSsmlWithGoogleCloud(
    ssml: string,
    languageCode: LanguageCode
  ): Promise<string> {
    const [response] = await this.textToSpeechClient.synthesizeSpeech({
      audioConfig: { audioEncoding: 'MP3' },
      input: { ssml },
      voice: GoogleCloudVoices[languageCode],
    });

    assert(response.audioContent instanceof Uint8Array);

    return Buffer.from(response.audioContent.buffer).toString('base64');
  }
}
