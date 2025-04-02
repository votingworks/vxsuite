/* istanbul ignore file - tested via VxSuite apps. @preserve */

import { BaseLogger } from '@votingworks/logging';
import {
  UiStringAudioClips,
  UiStringAudioIds,
  UiStringTranslations,
} from '@votingworks/types';
import { UiStringsStore } from './ui_strings_store';

/** App context for {@link UiStringsApiMethods} endpoints. */
export interface UiStringsApiContext {
  logger: BaseLogger;
  store: UiStringsStore;
}

function buildApi(context: UiStringsApiContext) {
  const { store } = context;

  return {
    getAvailableLanguages(): string[] {
      return store.getLanguages();
    },

    getUiStrings(input: { languageCode: string }): UiStringTranslations | null {
      return store.getUiStrings(input.languageCode);
    },

    getUiStringAudioIds(input: {
      languageCode: string;
    }): UiStringAudioIds | null {
      return store.getUiStringAudioIds(input.languageCode);
    },

    getAudioClips(input: {
      languageCode: string;
      audioIds: string[];
    }): UiStringAudioClips {
      return store.getAudioClips(input);
    },
  };
}

/** Grout API methods for UI string functions */
export type UiStringsApiMethods = ReturnType<typeof buildApi>;

/** Creates a shareable implementation of {@link UiStringsApiMethods}. */
export function createUiStringsApi(
  context: UiStringsApiContext
): UiStringsApiMethods {
  return buildApi(context);
}
