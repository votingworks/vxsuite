import { Optional } from '@votingworks/basics';

import { Dictionary } from './generic';
import { LanguageCode } from './language_code';
import { UiStringAudioKeys } from './ui_string_audio_keys';
import { UiStringTranslations } from './ui_string_translations';

export interface UiStringsApi {
  getAvailableLanguages(): LanguageCode[];

  getUiStrings(input: {
    languageCode: LanguageCode;
  }): Optional<UiStringTranslations>;

  getUiStringAudioKeys(input: {
    languageCode: LanguageCode;
  }): Optional<UiStringAudioKeys>;

  /**
   * Returns a map of the given audio keys to corresponding audio data in
   * Base64-encoded byte format.
   */
  getAudioClipsBase64(input: {
    languageCode: LanguageCode;
    audioKeys: string[];
  }): Dictionary<string>;
}
