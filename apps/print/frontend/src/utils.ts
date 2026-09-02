import { find } from '@votingworks/basics';
import { Election, Party } from '@votingworks/types';

export function getPartyOptions(election: Election): Party[] {
  const uniquePartyIds = new Set(
    election.ballotStyles
      .map((bs) => bs.partyId)
      .filter((partyId) => partyId !== undefined)
  );
  const parties = Array.from(uniquePartyIds).map((partyId) =>
    // @coverage-defer
    find(election.parties, (p) => p.id === partyId)
  );
  return parties;
}
