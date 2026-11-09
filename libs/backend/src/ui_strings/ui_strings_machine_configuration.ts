// @coverage-exclude-file: tested via VxSuite apps
import type { BaseLogger } from '@votingworks/logging';
import { assert, iter } from '@votingworks/basics';
import {
  type ElectionPackageZip,
  type ParsedElectionPackage,
  streamElectionPackageAudioClips,
} from '../election_package/election_package_io.js';
import type { UiStringsStore } from './ui_strings_store.js';

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

const AUDIO_CLIP_BATCH_SIZE = 100;

/**
 * Streams the audio clips in the given election package zip into the provided
 * store, one at a time, so that the full set (potentially GBs) is never held in
 * memory. Only clips for languages already configured in the store (see
 * {@link configureUiStrings}) are loaded.
 */
export async function configureUiStringAudioClipsStreaming(p: {
  zip: ElectionPackageZip;
  store: UiStringsStore;
}): Promise<void> {
  assert(
    !p.store.inTransaction(),
    'audio clips must not be imported inside a transaction: the stream awaits ' +
      'between clips, which would hold the transaction open'
  );

  const configuredLanguages = new Set(p.store.getLanguages());

  const batches = iter(streamElectionPackageAudioClips(p.zip))
    .filter((clip) => configuredLanguages.has(clip.languageCode))
    .chunks<number>(AUDIO_CLIP_BATCH_SIZE);
  for await (const batch of batches) {
    p.store.setAudioClips(batch);
  }
}
