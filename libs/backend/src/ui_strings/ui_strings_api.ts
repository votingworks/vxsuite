/* istanbul ignore file - tested via VxSuite apps. */

import { BaseLogger } from '@votingworks/logging';
import * as grout from '@votingworks/grout';
import {
  LanguageCode,
  UiStringAudioClips,
  UiStringAudioIds,
  UiStringTranslations,
} from '@votingworks/types';
import { UiStringsStore } from './ui_strings_store';

/** App context for {@link UiStringsApi} endpoints. */
export interface UiStringsApiContext {
  logger: BaseLogger;
  store: UiStringsStore;
}

function buildApi(context: UiStringsApiContext) {
  const { store } = context;

  return grout.createApi({
    getAvailableLanguages(): LanguageCode[] {
      return store.getLanguages();
    },

    getUiStrings(input: {
      languageCode: LanguageCode;
    }): UiStringTranslations | null {
      return store.getUiStrings(input.languageCode);
    },

    getUiStringAudioIds(input: {
      languageCode: LanguageCode;
    }): UiStringAudioIds | null {
      return store.getUiStringAudioIds(input.languageCode);
    },

    getAudioClips(input: {
      languageCode: LanguageCode;
      audioIds: string[];
    }): UiStringAudioClips {
      return store.getAudioClips(input);
    },
  });
}

/** Grout API definition for UI string functions */
export type UiStringsApi = ReturnType<typeof buildApi>;

/** Creates a shareable implementation of {@link UiStringsApi}. */
export function createUiStringsApi(context: UiStringsApiContext): UiStringsApi {
  return buildApi(context);
}
