import { UiStringAudioClips } from './ui_string_audio_clips';
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

  getAudioClips(input: {
    languageCode: LanguageCode;
    audioIds: string[];
  }): UiStringAudioClips;
}
