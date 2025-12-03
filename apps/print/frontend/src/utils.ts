import { Election, LanguageCode } from '@votingworks/types';

function sortLanguages(
  languageA: LanguageCode,
  languageB: LanguageCode
): number {
  const languageOrder: LanguageCode[] = [
    LanguageCode.ENGLISH,
    LanguageCode.SPANISH,
    LanguageCode.CHINESE_SIMPLIFIED,
    LanguageCode.CHINESE_TRADITIONAL,
  ];
  const indexA = languageOrder.indexOf(languageA);
  const indexB = languageOrder.indexOf(languageB);
  return indexA - indexB;
}

export function getAvailableLanguages(election: Election): LanguageCode[] {
  return Array.from(
    new Set(
      election.ballotStyles.flatMap((bs) => bs.languages as LanguageCode[])
    )
  )
    .filter((lang) => lang !== undefined)
    .sort(sortLanguages);
}
