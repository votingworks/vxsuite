import { SpeechSynthesizer } from '@votingworks/backend';
import { LanguageCode } from '@votingworks/types';

/**
 * Mock implementation of the SpeechSynthesizer interface. Returns an empty string for all text.
 */
export class MockTextToSpeechSynthesizer implements SpeechSynthesizer {
  // eslint-disable-next-line @typescript-eslint/require-await
  async synthesizeSpeech(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    text: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    languageCode: LanguageCode
  ): Promise<string> {
    return '';
  }
}
