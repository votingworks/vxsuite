/* istanbul ignore file - tested via VxSuite apps. */

import { ElectionPackage } from '@votingworks/types';
import { BaseLogger } from '@votingworks/logging';
import { UiStringsStore } from './ui_strings_store';

/** Input for {@link configureUiStrings}. */
export interface ElectionPackageProcessorInput {
  electionPackage: ElectionPackage;
  logger: BaseLogger;
  noAudio?: boolean;
  store: UiStringsStore;
}

function loadStrings(input: ElectionPackageProcessorInput): void {
  const { electionPackage, store } = input;

  if (!electionPackage.uiStrings) {
    return;
  }

  for (const [languageCode, data] of Object.entries(
    electionPackage.uiStrings
  )) {
    store.setUiStrings({ languageCode, data });
  }
}

function loadAudioClips(input: ElectionPackageProcessorInput): void {
  const { electionPackage, store } = input;

  if (!electionPackage.uiStringAudioClips) {
    return;
  }

  const configuredLanguages = new Set(store.getLanguages());
  for (const clip of electionPackage.uiStringAudioClips) {
    if (!configuredLanguages.has(clip.languageCode)) {
      continue;
    }

    store.setAudioClip(clip);
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
  loadAudioClips(input);
  loadAudioIds(input);
}
