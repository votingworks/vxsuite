import { Dictionary } from './generic';
import { LanguageCode } from './language_code';
import { UiStringAudioIds } from './ui_string_audio_ids';
import { UiStringTranslations } from './ui_string_translations';

export interface UiStringsApi {
  getAvailableLanguages(): LanguageCode[];

  getUiStrings(input: {
    languageCode: LanguageCode;
  }): UiStringTranslations | null;

  getUiStringAudioIds(input: {
    languageCode: LanguageCode;
  }): UiStringAudioIds | null;

  /**
   * Returns a map of the given audio IDs to corresponding audio data in
   * Base64-encoded byte format.
   */
  getAudioClipsBase64(input: {
    languageCode: LanguageCode;
    audioIds: string[];
  }): Dictionary<string>;
}
