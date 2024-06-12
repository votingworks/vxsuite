import {
  Election,
  MachineVersion,
  UiStringsPackage,
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
  const { electionStrings } = await extractAndTranslateElectionStrings(
    translator,
    election,
    ballotLanguageConfigs
  );
  const appStrings = await translateAppStrings(
    translator,
    machineVersion,
    ballotLanguageConfigs
  );
  return mergeUiStrings(electionStrings, appStrings);
}
