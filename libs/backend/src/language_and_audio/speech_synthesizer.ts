import { Buffer } from 'node:buffer';
import {
  TextToSpeechClient as GoogleCloudTextToSpeechClient,
  protos,
} from '@google-cloud/text-to-speech';
import { assert } from '@votingworks/basics';

import { LanguageCode } from '@votingworks/types';
import { convertHtmlToAudioCues } from './rich_text';

/**
 * Available voices are listed at https://cloud.google.com/text-to-speech/docs/voices.
 *
 * TODO: Decide which voices we want to use.
 */
export const GoogleCloudVoices: Record<
  LanguageCode,
  { languageCode: string; name: string } | null
> = {
  [LanguageCode.ARABIC]: {
    languageCode: 'ar-XA',
    name: 'ar-XA-Wavenet-B',
  },
  [LanguageCode.BENGALI]: {
    languageCode: 'bn-IN',
    name: 'bn-IN-Wavenet-B',
  },
  [LanguageCode.CHINESE_SIMPLIFIED]: {
    languageCode: 'cmn-CN',
    name: 'cmn-CN-Wavenet-B',
  },
  [LanguageCode.CHINESE_TRADITIONAL]: {
    languageCode: 'cmn-CN',
    name: 'cmn-CN-Wavenet-B',
  },
  [LanguageCode.ENGLISH]: { languageCode: 'en-US', name: 'en-US-Neural2-J' },
  [LanguageCode.HINDI]: { languageCode: 'hi-IN', name: 'hi-IN-Neural2-B' },
  [LanguageCode.JAPANESE]: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-D' },
  [LanguageCode.KHMER]: null, // Not yet supported by Google Cloud TTS.
  [LanguageCode.KOREAN]: { languageCode: 'ko-KR', name: 'ko-KR-Wavenet-C' },
  [LanguageCode.SPANISH]: { languageCode: 'es-US', name: 'es-US-Neural2-B' },
  [LanguageCode.TAGALOG]: { languageCode: 'fil-PH', name: 'fil-PH-Neural2-D' },
  [LanguageCode.VIETNAMESE]: { languageCode: 'vi-VN', name: 'vi-VN-Neural2-D' },
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
  fromSsml(ssml: string, languageCode: LanguageCode): Promise<string>;
  supportsLanguage?(languageCode: LanguageCode): boolean;
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
  /* istanbul ignore next */
  supportsLanguage(languageCode: LanguageCode): boolean {
    return !!GoogleCloudVoices[languageCode];
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
    // [TODO] Better handling.
    /* istanbul ignore next */
    if (!this.supportsLanguage(languageCode)) return '';

    const [response] = await this.textToSpeechClient.synthesizeSpeech({
      audioConfig: { audioEncoding: 'MP3' },
      input: { text: sanitizedText },
      voice: GoogleCloudVoices[languageCode],
    });

    assert(response.audioContent instanceof Uint8Array);

    return Buffer.from(response.audioContent.buffer).toString('base64');
  }

  /* istanbul ignore next */
  async fromSsml(ssml: string, languageCode: LanguageCode): Promise<string> {
    return await this.fromSsmlWithGoogleCloud(ssml, languageCode);
  }

  /* istanbul ignore next */
  protected async fromSsmlWithGoogleCloud(
    ssml: string,
    languageCode: LanguageCode
  ): Promise<string> {
    // [TODO] Better handling.
    /* istanbul ignore next */
    if (!this.supportsLanguage(languageCode)) return '';

    const [response] = await this.textToSpeechClient.synthesizeSpeech({
      audioConfig: { audioEncoding: 'MP3' },
      input: { ssml },
      voice: GoogleCloudVoices[languageCode],
    });

    assert(response.audioContent instanceof Uint8Array);

    return Buffer.from(response.audioContent.buffer).toString('base64');
  }
}
