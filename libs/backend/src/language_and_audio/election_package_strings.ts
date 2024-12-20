import {
  BallotLanguageConfigs,
  Election,
  UiStringsPackage,
} from '@votingworks/types';
import { GoogleCloudTranslator } from './translator';
import { translateAppStrings } from './app_strings';
import { translateHmpbStrings } from './ballot_strings';
import { extractAndTranslateElectionStrings } from './election_strings';

/**
 * Helper function to generate all necessary strings used in an election package.
 * Returns three packages of strings: app strings, HMPB strings, and election strings.
 */
export async function getAllStringsForElectionPackage(
  election: Election,
  translator: GoogleCloudTranslator,
  ballotLanguageConfigs: BallotLanguageConfigs
): Promise<[UiStringsPackage, UiStringsPackage, UiStringsPackage]> {
  const appStrings = await translateAppStrings(
    translator,
    'latest',
    ballotLanguageConfigs
  );
  const hmpbStrings = await translateHmpbStrings(
    translator,
    ballotLanguageConfigs
  );
  const electionStrings = await extractAndTranslateElectionStrings(
    translator,
    election,
    ballotLanguageConfigs
  );

  return [appStrings, hmpbStrings, electionStrings];
}
