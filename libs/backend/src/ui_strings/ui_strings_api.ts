/* istanbul ignore file - tested via VxSuite apps. */

import { Optional } from '@votingworks/basics';
import { Logger } from '@votingworks/logging';
import {
  Dictionary,
  LanguageCode,
  UiStringAudioKeys,
  UiStringTranslations,
  UiStringsApi,
} from '@votingworks/types';

import { UiStringsStore } from './ui_strings_store';

/** App context for {@link UiStringsApi} endpoints. */
export interface UiStringsApiContext {
  logger: Logger;
  store: UiStringsStore;
}

/** Creates a shareable implementation of {@link UiStringsApi}. */
export function createUiStringsApi(context: UiStringsApiContext): UiStringsApi {
  const { store } = context;

  return {
    getAvailableLanguages(): LanguageCode[] {
      return store.getLanguages();
    },

    getUiStrings(input: {
      languageCode: LanguageCode;
    }): Optional<UiStringTranslations> {
      throw new Error(
        `Not yet implemented. Requested language code: ${input.languageCode}`
      );
    },

    getUiStringAudioKeys(input: {
      languageCode: LanguageCode;
    }): Optional<UiStringAudioKeys> {
      throw new Error(
        `Not yet implemented. Requested language code: ${input.languageCode}`
      );
    },

    getAudioClipsBase64(input: {
      languageCode: LanguageCode;
      audioKeys: string[];
    }): Dictionary<string> {
      throw new Error(
        `Not yet implemented. Requested language code: ${input.languageCode} | audioKeys: ${input.audioKeys}`
      );
    },
  };
}
