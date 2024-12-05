import { LanguageCode } from './language_code';

export interface BallotLanguageConfig {
  languages: LanguageCode[];
}

export type BallotLanguageConfigs = BallotLanguageConfig[];

export function getAllBallotLanguages(
  ballotLanguageConfigs: BallotLanguageConfigs
): LanguageCode[] {
  const uniqueLanguages = new Set(
    ballotLanguageConfigs.flatMap((b) => b.languages)
  );

  return [...uniqueLanguages];
}

export function getBallotLanguageConfigs(
  isMultiLanguage: boolean
): BallotLanguageConfigs {
  return isMultiLanguage
    ? Object.values(LanguageCode).map(
        (l): BallotLanguageConfig => ({ languages: [l] })
      )
    : [{ languages: [LanguageCode.ENGLISH] }];
}
