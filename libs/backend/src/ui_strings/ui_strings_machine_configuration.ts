/* istanbul ignore file - tested via VxSuite apps. */

import { BaseLogger } from '@votingworks/logging';
import {
  ParsedElectionPackage,
  streamElectionPackageAudioClips,
} from '../election_package/election_package_io';
import { UiStringsStore } from './ui_strings_store';

/** Input for {@link configureUiStrings}. */
export interface ElectionPackageProcessorInput {
  electionPackage: ParsedElectionPackage;
  logger: BaseLogger;
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
}

/**
 * Streams the audio clips in the election package zip at
 * `electionPackageFilePath` into the provided store in size-capped batches,
 * so that the full set (potentially GBs) is never held in memory. Only clips
 * for languages already configured in the store (see
 * {@link configureUiStrings}) are loaded, and each batch is inserted within
 * `withTransaction`.
 */
export async function configureUiStringAudioClipsStreaming({
  electionPackageFilePath,
  store,
  withTransaction,
}: {
  electionPackageFilePath: string;
  store: UiStringsStore;
  withTransaction: (fn: () => void) => void;
}): Promise<void> {
  const configuredLanguages = new Set(store.getLanguages());
  await streamElectionPackageAudioClips(electionPackageFilePath, (clips) =>
    withTransaction(() => {
      for (const clip of clips) {
        if (configuredLanguages.has(clip.languageCode)) {
          store.setAudioClip(clip);
        }
      }
    })
  );
}
