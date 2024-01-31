import { Election, Party, PartyId, District } from '@votingworks/types';
import { find, unique } from '@votingworks/basics';

export function getPartiesWithPrimaryElections(election: Election): Party[] {
  const partyIds = election.ballotStyles
    .map((bs) => bs.partyId)
    .filter((id): id is PartyId => id !== undefined);
  return election.parties.filter((party) => partyIds.includes(party.id));
}

/**
 * Returns all districts that have some ballot style associated with them.
 */
export function getValidDistricts(election: Election): District[] {
  const ids = unique(election.ballotStyles.flatMap((bs) => bs.districts));
  return ids.map((id) =>
    find(election.districts, (district) => district.id === id)
  );
}
