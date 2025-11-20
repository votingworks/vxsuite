import { Election, LanguageCode } from '@votingworks/types';

export function getAvailableLanguages(election: Election): LanguageCode[] {
  return Array.from(
    new Set(election.ballotStyles.flatMap((bs) => bs.languages))
  ).filter((lang) => lang !== undefined) as LanguageCode[];
}
