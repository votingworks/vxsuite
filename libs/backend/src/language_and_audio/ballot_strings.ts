import {
  Election,
  UiStringsPackage,
  mergeUiStrings,
  BallotLanguageConfigs,
  getAllBallotLanguages,
  LanguageCode,
  SplittablePrecinct,
  hasSplits,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { extractAndTranslateElectionStrings } from './election_strings';
import { GoogleCloudTranslator } from './translator';
import { setUiString } from './utils';

/**
 * Extracts strings defined on a list of "precinct splits".
 * @param precincts A list of SplittablePrecincts
 * @returns A catalog of strings defined by the user in VxDesign.
 */
export function getUserDefinedHmpbStrings(
  precincts: SplittablePrecinct[]
): Record<string, string> {
  const catalog: Record<string, string> = {};
  for (const precinct of precincts) {
    if (hasSplits(precinct)) {
      for (const split of precinct.splits) {
        if (split.clerkSignatureCaption) {
          catalog[`hmpbClerkSignatureCaption_${precinct.id}_${split.id}`] =
            split.clerkSignatureCaption;
        }
        if (split.electionTitleOverride) {
          catalog[`hmpbElectionTitleOverride_${precinct.id}_${split.id}`] =
            split.electionTitleOverride;
        }
      }
    }
  }

  return catalog;
}

/**
 *  Translates all HMPB strings for the given ballot language configs.
 */
export async function translateHmpbStrings(
  translator: GoogleCloudTranslator,
  hmpbStringsCatalog: Record<string, string>,
  ballotLanguageConfigs: BallotLanguageConfigs
): Promise<UiStringsPackage> {
  const languages = getAllBallotLanguages(ballotLanguageConfigs);

  const hmpbStringKeys = Object.keys(hmpbStringsCatalog).sort();
  const hmpbStringsInEnglish = hmpbStringKeys.map(
    (key) => hmpbStringsCatalog[key] as string
  );

  const hmpbStrings: UiStringsPackage = {};
  for (const languageCode of languages) {
    const hmpbStringsInLanguage =
      languageCode === LanguageCode.ENGLISH
        ? hmpbStringsInEnglish
        : await translator.translateText(hmpbStringsInEnglish, languageCode);
    for (const [i, key] of hmpbStringKeys.entries()) {
      setUiString(
        hmpbStrings,
        languageCode,
        key,
        assertDefined(hmpbStringsInLanguage[i])
      );
    }
  }
  return hmpbStrings;
}

/**
 * Translates (or loads from the translation cache) a UI strings package for
 * HMPB rendering. Includes all election strings and app strings.
 */
export async function translateElectionAndHmpbStrings(
  translator: GoogleCloudTranslator,
  election: Election,
  hmpbStringsCatalog: Record<string, string>,
  ballotLanguageConfigs: BallotLanguageConfigs,
  precincts: SplittablePrecinct[]
): Promise<{
  electionStrings: UiStringsPackage;
  hmpbStrings: UiStringsPackage;
}> {
  const userDefinedHmpbStrings = getUserDefinedHmpbStrings(precincts);
  const combinedHmpbStringsCatalog: Record<string, string> = {
    ...hmpbStringsCatalog,
    ...userDefinedHmpbStrings,
  };

  const electionStrings = await extractAndTranslateElectionStrings(
    translator,
    election,
    ballotLanguageConfigs
  );
  const hmpbStrings = await translateHmpbStrings(
    translator,
    combinedHmpbStringsCatalog,
    ballotLanguageConfigs
  );

  return { electionStrings, hmpbStrings };
}

/**
 * Translates (or loads from the translation cache) HMPB and election strings,
 * then merges the results into a single UiStringsPackage.
 * Includes all election strings and app strings needed for HMPB rendering.
 */
export async function translateBallotStrings(
  ...args: [
    GoogleCloudTranslator,
    Election,
    Record<string, string>,
    BallotLanguageConfigs,
    SplittablePrecinct[],
  ]
): Promise<UiStringsPackage> {
  const { electionStrings, hmpbStrings } =
    await translateElectionAndHmpbStrings(...args);
  return mergeUiStrings(electionStrings, hmpbStrings);
}
