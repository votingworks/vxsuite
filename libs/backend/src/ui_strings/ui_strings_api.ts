/* istanbul ignore file - tested via VxSuite apps. */

import { Logger } from '@votingworks/logging';
import { UiStringsApi } from '@votingworks/types';

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
    getAvailableLanguages() {
      return store.getLanguages();
    },

    getUiStrings(input) {
      return store.getUiStrings(input.languageCode);
    },

    getUiStringAudioIds(input) {
      throw new Error(
        `Not yet implemented. Requested language code: ${input.languageCode}`
      );
    },

    getAudioClipsBase64(input) {
      throw new Error(
        `Not yet implemented. Requested language code: ${input.languageCode} | audioIds: ${input.audioIds}`
      );
    },
  };
}
