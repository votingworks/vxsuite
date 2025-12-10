import { LanguageCode, Election } from '@votingworks/types';

export function languageSort(
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

export function getLanguageOptions(election: Election): LanguageCode[] {
  return [
    ...new Set(
      election.ballotStyles.flatMap((bs) => bs.languages as LanguageCode[])
    ),
  ]
    .filter((lang) => lang !== undefined)
    .sort(languageSort);
}
