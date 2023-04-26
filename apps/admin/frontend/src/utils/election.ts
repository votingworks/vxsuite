import {
  AnyContest,
  Election,
  Party,
  PartyId,
  PrecinctId,
} from '@votingworks/types';

export function getDistrictIdsForPartyId(
  election: Election,
  partyId: PartyId
): string[] {
  return election.ballotStyles
    .filter((bs) => bs.partyId === partyId)
    .flatMap((bs) => bs.districts);
}

export function getPartiesWithPrimaryElections(election: Election): Party[] {
  const partyIds = election.ballotStyles
    .map((bs) => bs.partyId)
    .filter((id): id is PartyId => id !== undefined);
  return election.parties.filter((party) => partyIds.includes(party.id));
}

export function getContestsForPrecinct(
  election: Election,
  precinctId: PrecinctId
): AnyContest[] {
  const precinct = election.precincts.find((p) => p.id === precinctId);
  if (precinct === undefined) {
    return [];
  }
  const precinctBallotStyles = election.ballotStyles.filter((bs) =>
    bs.precincts.includes(precinct.id)
  );

  return election.contests.filter((c) => {
    const districts = precinctBallotStyles
      .filter((bs) => {
        const contestPartyId = c.type === 'candidate' ? c.partyId : undefined;
        return bs.partyId === contestPartyId;
      })
      .flatMap((bs) => bs.districts);
    return districts.includes(c.districtId);
  });
}
