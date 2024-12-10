import {
  GoogleCloudSpeechSynthesizer,
  MinimalGoogleCloudTextToSpeechClient,
} from '@votingworks/backend';
import { LanguageCode } from '@votingworks/types';
import { rootDebug } from './debug';
import { Store } from './store';

const debug = rootDebug.extend('speech');

/**
 * An implementation of {@link GoogleCloudSpeechSynthesizer} that uses the
 * local db in the VxDesign backend for caching
 */
export class GoogleCloudSpeechSynthesizerWithDbCache extends GoogleCloudSpeechSynthesizer {
  private readonly store: Store;

  constructor(input: {
    store: Store;
    // Support providing a mock client for tests
    textToSpeechClient?: MinimalGoogleCloudTextToSpeechClient;
  }) {
    super({ textToSpeechClient: input.textToSpeechClient });
    this.store = input.store;
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
      debug(`🔉 Using cached speech: ${text.slice(0, 20)}...`);
      return audioClipBase64FromCache;
    }

    debug(`🔉 Synthesizing speech: ${text.slice(0, 20)}...`);

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
}
