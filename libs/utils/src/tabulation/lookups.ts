import { Optional, assert, assertDefined } from '@votingworks/basics';
import {
  AnyContest,
  BallotStyle,
  BallotStyleId,
  ContestId,
  Election,
  ElectionDefinition,
  Party,
  PartyId,
  Precinct,
  PrecinctId,
  Tabulation,
} from '@votingworks/types';

/**
 * Creates a lookup function for getting some election metadata based on a key.
 * The function builds a dictionary on the first call for each election to ensure
 * subsequent lookups are O(1).
 */
export function createElectionMetadataLookupFunction<T>(
  buildLookupFn: (election: Election) => Map<string, T>
): (electionDefinition: ElectionDefinition, key: string) => T {
  const cachedLookups = new Map<string, Map<string, T>>();

  return (electionDefinition: ElectionDefinition, key: string): T => {
    const cachedLookup = cachedLookups.get(electionDefinition.electionHash);
    if (cachedLookup) {
      return assertDefined(cachedLookup.get(key));
    }

    const lookup = buildLookupFn(electionDefinition.election);
    cachedLookups.set(electionDefinition.electionHash, lookup);
    return assertDefined(lookup.get(key));
  };
}

export const getPrecinctById = createElectionMetadataLookupFunction(
  (election) => {
    const { precincts } = election;
    const precinctLookup = new Map<PrecinctId, Precinct>();
    for (const precinct of precincts) {
      precinctLookup.set(precinct.id, precinct);
    }
    return precinctLookup;
  }
);

export const getPartyById = createElectionMetadataLookupFunction((election) => {
  const { parties } = election;
  const partyLookup = new Map<PartyId, Party>();
  for (const party of parties) {
    partyLookup.set(party.id, party);
  }
  return partyLookup;
});

export const getContestById = createElectionMetadataLookupFunction(
  (election) => {
    const { contests } = election;
    const lookup = new Map<ContestId, AnyContest>();
    for (const contest of contests) {
      lookup.set(contest.id, contest);
    }
    return lookup;
  }
);

export const getBallotStyleById = createElectionMetadataLookupFunction(
  (election) => {
    const { ballotStyles } = election;
    const lookup = new Map<BallotStyleId, BallotStyle>();
    for (const ballotStyle of ballotStyles) {
      lookup.set(ballotStyle.id, ballotStyle);
    }
    return lookup;
  }
);

export const getBallotStylesByPartyId = createElectionMetadataLookupFunction(
  (election) => {
    const { ballotStyles } = election;
    const lookup = new Map<string, BallotStyle[]>();
    for (const party of election.parties) {
      lookup.set(party.id, []);
    }

    for (const ballotStyle of ballotStyles) {
      const { partyId } = ballotStyle;
      if (partyId) {
        const partyBallotStyles = lookup.get(partyId);
        assert(partyBallotStyles);
        partyBallotStyles.push(ballotStyle);
      }
    }
    return lookup;
  }
);

export const getBallotStylesByPrecinctId = createElectionMetadataLookupFunction(
  (election) => {
    const { ballotStyles } = election;
    const lookup = new Map<PrecinctId, BallotStyle[]>();
    for (const precinct of election.precincts) {
      lookup.set(precinct.id, []);
    }

    for (const ballotStyle of ballotStyles) {
      const { precincts: precinctIds } = ballotStyle;
      for (const precinctId of precinctIds) {
        const precinctBallotStyles = lookup.get(precinctId);
        assert(precinctBallotStyles);
        precinctBallotStyles.push(ballotStyle);
      }
    }
    return lookup;
  }
);

/**
 * Tries to determine party ID from ballot style ID if not available directly.
 */
export function determinePartyId<T>(
  electionDefinition: ElectionDefinition,
  group: Tabulation.GroupOf<T>
): Optional<string> {
  if (group.partyId) return group.partyId;

  if (!group.ballotStyleId) return undefined;

  return getBallotStyleById(electionDefinition, group.ballotStyleId).partyId;
}
