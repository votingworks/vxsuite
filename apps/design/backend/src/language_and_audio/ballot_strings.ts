import { Election, UiStringsPackage, mergeUiStrings } from '@votingworks/types';
import { hmpbStringsCatalog } from '@votingworks/hmpb';
import { BallotLanguageConfigs, getAllBallotLanguages } from '../types';
import { extractAndTranslateElectionStrings } from './election_strings';
import { GoogleCloudTranslator, Translator } from './translator';
import { setUiString } from './utils';
import { LanguageCode } from '../language_code';

export async function translateHmpbStrings(
  translator: Translator,
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
      setUiString(hmpbStrings, languageCode, key, hmpbStringsInLanguage[i]);
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
