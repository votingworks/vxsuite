import {
  Election,
  Party,
  PartyId,
  District,
  isOpenPrimary,
} from '@votingworks/types';
import { find, unique } from '@votingworks/basics';

export function getPartiesWithPrimaryElections(election: Election): Party[] {
  // For open primaries, ballot styles have no partyId — derive parties from
  // contest partyIds instead.
  if (isOpenPrimary(election)) {
    const contestPartyIds = unique(
      election.contests
        .map((c) => ('partyId' in c ? c.partyId : undefined))
        .filter((id): id is PartyId => id !== undefined)
    );
    return election.parties.filter((party) =>
      contestPartyIds.includes(party.id)
    );
  }
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
