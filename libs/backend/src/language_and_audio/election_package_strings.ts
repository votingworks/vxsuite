import {
  BallotLanguageConfigs,
  Election,
  SplittablePrecinct,
  UiStringsPackage,
} from '@votingworks/types';
import { GoogleCloudTranslator } from './translator';
import { translateAppStrings } from './app_strings';
import {
  getUserDefinedHmpbStrings,
  translateHmpbStrings,
} from './ballot_strings';
import { extractAndTranslateElectionStrings } from './election_strings';

/**
 * Helper function to generate all necessary strings used in an election package.
 * Returns three packages of strings: app strings, HMPB strings, and election strings.
 */
export async function getAllStringsForElectionPackage(
  election: Election,
  translator: GoogleCloudTranslator,
  hmpbStringsCatalog: Record<string, string>,
  ballotLanguageConfigs: BallotLanguageConfigs,
  precincts: SplittablePrecinct[]
): Promise<[UiStringsPackage, UiStringsPackage, UiStringsPackage]> {
  const userDefinedHmpbStrings = getUserDefinedHmpbStrings(precincts);
  const combinedHmpbStringsCatalog: Record<string, string> = {
    ...hmpbStringsCatalog,
    ...userDefinedHmpbStrings,
  };

  const appStrings = await translateAppStrings(
    translator,
    'latest',
    ballotLanguageConfigs
  );
  const hmpbStrings = await translateHmpbStrings(
    translator,
    combinedHmpbStringsCatalog,
    ballotLanguageConfigs
  );
  const electionStrings = await extractAndTranslateElectionStrings(
    translator,
    election,
    ballotLanguageConfigs
  );

  return [appStrings, hmpbStrings, electionStrings];
}
