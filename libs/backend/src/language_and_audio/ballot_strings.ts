import {
  Election,
  UiStringsPackage,
  mergeUiStrings,
  BallotLanguageConfigs,
  getAllBallotLanguages,
  LanguageCode,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { hmpbStringsCatalog } from './hmpb_strings';
import { extractAndTranslateElectionStrings } from './election_strings';
import { GoogleCloudTranslator } from './translator';
import { setUiString } from './utils';

/**
 *  Translates all HMPB strings for the given ballot language configs.
 */
export async function translateHmpbStrings(
  translator: GoogleCloudTranslator,
  ballotLanguageConfigs: BallotLanguageConfigs
): Promise<UiStringsPackage> {
  const languages = getAllBallotLanguages(ballotLanguageConfigs);

  const hmpbStringKeys = Object.keys(hmpbStringsCatalog).sort();
  const hmpbStringsInEnglish = hmpbStringKeys.map(
    (key) => hmpbStringsCatalog[key as keyof typeof hmpbStringsCatalog]
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
export async function translateBallotStrings(
  translator: GoogleCloudTranslator,
  election: Election,
  ballotLanguageConfigs: BallotLanguageConfigs
): Promise<UiStringsPackage> {
  const electionStrings = await extractAndTranslateElectionStrings(
    translator,
    election,
    ballotLanguageConfigs
  );
  const hmpbStrings = await translateHmpbStrings(
    translator,
    ballotLanguageConfigs
  );
  return mergeUiStrings(electionStrings, hmpbStrings);
}
