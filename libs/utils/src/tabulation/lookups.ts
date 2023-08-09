import { assert, assertDefined } from '@votingworks/basics';
import {
  AnyContest,
  BallotStyle,
  BallotStyleId,
  Election,
  ElectionDefinition,
  Party,
  Precinct,
  PrecinctId,
} from '@votingworks/types';

/**
 * Creates a lookup function for getting some election metadata based on a key.
 * The function builds a dictionary on the first call for each election to ensure
 * subsequent lookups are O(1).
 */
export function createElectionMetadataLookupFunction<T>(
  buildLookupFn: (election: Election) => Record<string, T>
): (electionDefinition: ElectionDefinition, key: string) => T {
  const cachedLookups: Record<string, Record<string, T>> = {};

  return (electionDefinition: ElectionDefinition, key: string): T => {
    const cachedLookup = cachedLookups[electionDefinition.electionHash];
    if (cachedLookup) {
      return assertDefined(cachedLookup[key]);
    }

    const lookup = buildLookupFn(electionDefinition.election);
    cachedLookups[electionDefinition.electionHash] = lookup;
    return assertDefined(lookup[key]);
  };
}

/**
 * Returns the name of the precinct with the given ID. Caches results for
 * repeated lookups.
 */
export const getPrecinctById = createElectionMetadataLookupFunction(
  (election) => {
    const { precincts } = election;
    const precinctLookup: Record<string, Precinct> = {};
    for (const precinct of precincts) {
      precinctLookup[precinct.id] = precinct;
    }
    return precinctLookup;
  }
);

/**
 * Returns the short name of the party with the given ID. Caches results
 * for repeated lookups.
 */
export const getPartyById = createElectionMetadataLookupFunction((election) => {
  const { parties } = election;
  const partyLookup: Record<string, Party> = {};
  for (const party of parties) {
    partyLookup[party.id] = party;
  }
  return partyLookup;
});

export const getContestById = createElectionMetadataLookupFunction(
  (election) => {
    const { contests } = election;
    const lookup: Record<string, AnyContest> = {};
    for (const contest of contests) {
      lookup[contest.id] = contest;
    }
    return lookup;
  }
);

/**
 * Returns the party ID associated with a ballot style, if any. Caches results
 * for repeated lookups.
 */
export const getBallotStyleById = createElectionMetadataLookupFunction(
  (election) => {
    const { ballotStyles } = election;
    const lookup: Record<BallotStyleId, BallotStyle> = {};
    for (const ballotStyle of ballotStyles) {
      lookup[ballotStyle.id] = ballotStyle;
    }
    return lookup;
  }
);

export const getBallotStylesByPartyId = createElectionMetadataLookupFunction(
  (election) => {
    const { ballotStyles } = election;
    const lookup: Record<string, BallotStyle[]> = {};
    for (const party of election.parties) {
      lookup[party.id] = [];
    }

    for (const ballotStyle of ballotStyles) {
      const { partyId } = ballotStyle;
      if (partyId) {
        const partyBallotStyles = lookup[partyId];
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
    const lookup: Record<PrecinctId, BallotStyle[]> = {};
    for (const precinct of election.precincts) {
      lookup[precinct.id] = [];
    }

    for (const ballotStyle of ballotStyles) {
      const { precincts: precinctIds } = ballotStyle;
      for (const precinctId of precinctIds) {
        const precinctBallotStyles = lookup[precinctId];
        assert(precinctBallotStyles);
        precinctBallotStyles.push(ballotStyle);
      }
    }
    return lookup;
  }
);
