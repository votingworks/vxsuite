/* istanbul ignore file - tested via VxSuite apps. */

import { ElectionPackage, LanguageCode } from '@votingworks/types';
import { Logger } from '@votingworks/logging';
import { UiStringsStore } from './ui_strings_store';

/** Input for {@link configureUiStrings}. */
export interface ElectionPackageProcessorInput {
  electionPackage: ElectionPackage;
  logger: Logger;
  noAudio?: boolean;
  store: UiStringsStore;
}

function loadStrings(input: ElectionPackageProcessorInput): void {
  const { electionPackage, store } = input;

  if (!electionPackage.uiStrings) {
    return;
  }

  for (const languageCode of Object.values(LanguageCode)) {
    const data = electionPackage.uiStrings[languageCode];

    if (data) {
      store.setUiStrings({ languageCode, data });
    }
  }
}

function loadAudioIds(input: ElectionPackageProcessorInput): void {
  const { electionPackage, store } = input;

  if (!electionPackage.uiStringAudioIds) {
    return;
  }

  const configuredLanguages = store.getLanguages();
  for (const languageCode of configuredLanguages) {
    const data = electionPackage.uiStringAudioIds[languageCode];

    if (data) {
      store.setUiStringAudioIds({ languageCode, data });
    }
  }
}

/**
 * Loads data related to UI Strings from the given election package into the
 * provided store.
 */
export function configureUiStrings(input: ElectionPackageProcessorInput): void {
  loadStrings(input);
  loadAudioIds(input);

  // TODO(kofi):
  //   loadAudioClips(input);
}
