import { LanguageCode, Election } from '@votingworks/types';
import { languageDisplayName2 } from './format';

const { ENGLISH } = LanguageCode;

/**
 * All language codes, ordered in order of precedence for user selection when
 * displayed in English.
 */
export const ORDERED_LANGUAGES = Object.values(LanguageCode).sort(
  /* istanbul ignore next */
  (a, b) => {
    if (a === LanguageCode.ENGLISH) return -1;
    if (b === LanguageCode.ENGLISH) return 1;

    const labelA = languageDisplayName2({
      displayLanguageCode: ENGLISH,
      languageCode: a,
    });

    const labelB = languageDisplayName2({
      displayLanguageCode: ENGLISH,
      languageCode: b,
    });

    return labelA.localeCompare(labelB);
  }
);

export function languageSort(
  languageA: LanguageCode,
  languageB: LanguageCode
): number {
  const indexA = ORDERED_LANGUAGES.indexOf(languageA);
  const indexB = ORDERED_LANGUAGES.indexOf(languageB);
  return indexA - indexB;
}

export function getLanguageOptions(election: Election): LanguageCode[] {
  const ballotLanguages = new Set(
    election.ballotStyles.flatMap((bs) => bs.languages as LanguageCode[])
  );

  return ORDERED_LANGUAGES.filter((l) => ballotLanguages.has(l));
}
