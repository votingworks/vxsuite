import {
  BallotLanguageConfigs,
  Election,
  SplittablePrecinct,
  UiStringsPackage,
} from '@votingworks/types';
import { GoogleCloudTranslator } from './translator';
import { translateAppStrings } from './app_strings';
import { translateElectionAndHmpbStrings } from './ballot_strings';

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
  const { hmpbStrings, electionStrings } =
    await translateElectionAndHmpbStrings(
      translator,
      election,
      hmpbStringsCatalog,
      ballotLanguageConfigs,
      precincts
    );

  const appStrings = await translateAppStrings(
    translator,
    'latest',
    ballotLanguageConfigs
  );

  return [appStrings, hmpbStrings, electionStrings];
}
