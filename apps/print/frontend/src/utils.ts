import { assertDefined } from '@votingworks/basics';
import { Election, LanguageCode, Party } from '@votingworks/types';

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

export function getLanguageOptions(election: Election): LanguageCode[] {
  return Array.from(
    new Set(
      election.ballotStyles.flatMap((bs) => bs.languages as LanguageCode[])
    )
  )
    .filter((lang) => lang !== undefined)
    .sort(sortLanguages);
}

export function getPartyOptions(election: Election): Party[] {
  if (election.type !== 'primary') {
    return [];
  }
  const uniquePartyIds = new Set(
    election.ballotStyles
      .map((bs) => bs.partyId)
      .filter((partyId) => partyId !== undefined)
  );
  const parties = Array.from(uniquePartyIds).map((partyId) =>
    assertDefined(
      election.parties.find((p) => p.id === partyId),
      `Party not found: ${  partyId}`
    )
  );
  return parties;
}
