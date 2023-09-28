/* istanbul ignore file - tested via VxSuite apps. */

import { BallotPackage, LanguageCode } from '@votingworks/types';
import { Logger } from '@votingworks/logging';
import { UiStringsStore } from './ui_strings_store';

/** Input for {@link configureUiStrings}. */
export interface BallotPackageProcessorInput {
  ballotPackage: BallotPackage;
  logger: Logger;
  noAudio?: boolean;
  store: UiStringsStore;
}

function loadStrings(input: BallotPackageProcessorInput): void {
  const { ballotPackage, store } = input;

  if (!ballotPackage.uiStrings) {
    return;
  }

  for (const languageCode of Object.values(LanguageCode)) {
    const data = ballotPackage.uiStrings[languageCode];

    if (data) {
      store.setUiStrings({ languageCode, data });
    }
  }
}

/**
 * Loads data related to UI Strings from the given ballot package into the
 * provided store.
 */
export function configureUiStrings(input: BallotPackageProcessorInput): void {
  loadStrings(input);

  // TODO(kofi):
  //   loadAudioIds(input);
  //   loadAudioClips(input);
}
