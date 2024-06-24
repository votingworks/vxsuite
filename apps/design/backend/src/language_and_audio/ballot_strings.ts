import {
  Election,
  MachineVersion,
  UiStringsPackage,
  filterUiStrings,
  mergeUiStrings,
} from '@votingworks/types';
import { BallotLanguageConfigs } from '../types';
import { translateAppStrings } from './app_strings';
import { extractAndTranslateElectionStrings } from './election_strings';
import { GoogleCloudTranslator } from './translator';

/**
 * Translates (or loads from the translation cache) a UI strings package for
 * HMPB rendering. Includes all election strings and app strings.
 */
export async function translateBallotStrings(
  translator: GoogleCloudTranslator,
  election: Election,
  ballotLanguageConfigs: BallotLanguageConfigs,
  machineVersion: MachineVersion
): Promise<UiStringsPackage> {
  const electionStrings = await extractAndTranslateElectionStrings(
    translator,
    election,
    ballotLanguageConfigs
  );
  const appStrings = await translateAppStrings(
    translator,
    machineVersion,
    ballotLanguageConfigs
  );
  // Temporary hack: Only pass the HMPB app strings to the renderer.
  // TODO: construct and translate these as a separate package
  const hmpbStrings = filterUiStrings(appStrings, (stringKey) =>
    stringKey.startsWith('hmpb')
  );
  return mergeUiStrings(electionStrings, hmpbStrings);
}
