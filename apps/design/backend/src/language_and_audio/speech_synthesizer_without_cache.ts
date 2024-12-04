import { Buffer } from 'node:buffer';
import { TextToSpeechClient as GoogleCloudTextToSpeechClient } from '@google-cloud/text-to-speech';
import { assertDefined } from '@votingworks/basics';

import { ElectionPackage } from '@votingworks/types';
import { rootDebug } from '../debug';
import { LanguageCode } from '../language_code';
import {
  convertHtmlToAudioCues,
  GoogleCloudVoices,
  MinimalGoogleCloudTextToSpeechClient,
  SpeechSynthesizer,
} from './speech_synthesizer';

const debug = rootDebug.extend('speech');

/**
 * An implementation of {@link SpeechSynthesizer} that uses the Google Cloud Text-to-Speech API
 */
export class GoogleCloudSpeechSynthesizerWithoutCache
  implements SpeechSynthesizer
{
  private readonly textToSpeechClient: MinimalGoogleCloudTextToSpeechClient;

  constructor(input: {
    // Support providing a mock client for tests
    textToSpeechClient?: MinimalGoogleCloudTextToSpeechClient;
    priorElectionPackage?: ElectionPackage;
  }) {
    this.textToSpeechClient =
      input.textToSpeechClient ??
      /* istanbul ignore next */ new GoogleCloudTextToSpeechClient();
  }

  async synthesizeSpeech(
    text: string,
    languageCode: LanguageCode
  ): Promise<string> {
    debug(`🔉 Synthesizing speech: ${text.slice(0, 20)}...`);

    const audioClipBase64 = await this.synthesizeSpeechWithGoogleCloud(
      text,
      languageCode
    );
    return audioClipBase64;
  }

  private async synthesizeSpeechWithGoogleCloud(
    text: string,
    languageCode: LanguageCode
  ): Promise<string> {
    const [response] = await this.textToSpeechClient.synthesizeSpeech({
      audioConfig: { audioEncoding: 'MP3' },
      input: { text: convertHtmlToAudioCues(text) },
      voice: GoogleCloudVoices[languageCode],
    });
    const audioClipBase64 = Buffer.from(
      assertDefined(response.audioContent)
    ).toString('base64');
    return audioClipBase64;
  }
}
