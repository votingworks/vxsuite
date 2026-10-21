import {
  assert,
  assertDefined,
  assertFindIndex,
  throwIllegalValue,
} from '@votingworks/basics';
import type {
  Contest,
  BallotStyle,
  BallotStyleGroupId,
  BallotStyleId,
  District,
  Election,
  ElectionDefinition,
  BallotStyleGroup,
  Party,
  PollingPlace,
  Precinct,
  PrecinctId,
  OptionalCandidateOrderings,
  CandidateContest,
} from '@votingworks/types';
import { getGroupedBallotStyles } from '../ballot_styles.js';
import { WRITE_IN_ID_PREFIX } from '../hmpb/all_contest_options.js';

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
    const cachedLookup = cachedLookups[electionDefinition.ballotHash];
    if (cachedLookup) {
      return assertDefined(cachedLookup[key]);
    }

    const lookup = buildLookupFn(electionDefinition.election);
    cachedLookups[electionDefinition.ballotHash] = lookup;
    return assertDefined(lookup[key]);
  };
}

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

export const getDistrictById = createElectionMetadataLookupFunction(
  // @coverage-defer
  (election) => {
    const { districts } = election;
    const districtLookup: Record<string, District> = {};
    for (const district of districts) {
      districtLookup[district.id] = district;
    }
    return districtLookup;
  }
);

export const getPollingPlaceById = createElectionMetadataLookupFunction(
  (election) => {
    const { pollingPlaces } = election;
    const pollingPlaceLookup: Record<string, PollingPlace> = {};
    for (const pollingPlace of pollingPlaces) {
      pollingPlaceLookup[pollingPlace.id] = pollingPlace;
    }
    return pollingPlaceLookup;
  }
);

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
    const lookup: Record<string, Contest> = {};
    for (const contest of contests) {
      lookup[contest.id] = contest;
    }
    return lookup;
  }
);

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

export const getParentBallotStyleById = createElectionMetadataLookupFunction(
  (election) => {
    const { ballotStyles } = election;
    const lookup: Record<BallotStyleGroupId, BallotStyleGroup> = {};
    for (const ballotStyle of getGroupedBallotStyles(ballotStyles)) {
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
      // @coverage-defer
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

/**
 * Gets the zero-indexed position of a contest option on the ballot for a specific ballot style.
 * For candidates, this is the position in the ballot-style-specific candidate ordering.
 * For multi-endorsed candidates that appear multiple times, returns the first occurrence.
 * For yes/no contests, yes=0 and no=1.
 * For write-ins, positions are after all candidates.
 */
export function getOptionPosition(
  candidateOrderings: OptionalCandidateOrderings,
  contest: Contest,
  optionId: string
): number {
  switch (contest.type) {
    case 'candidate': {
      const ordering = candidateOrderings?.[contest.id] ?? contest.candidates;

      if (contest.allowWriteIns && optionId.startsWith(WRITE_IN_ID_PREFIX)) {
        return ordering.length + parseWriteInIndex({ contest, optionId });
      }

      return assertFindIndex(
        ordering,
        (candidate) => candidate.id === optionId,
        `candidate ${optionId} not in contest ${contest.id}`
      );
    }

    case 'straight-party':
      return assertFindIndex(
        contest.optionIds,
        (id) => id === optionId,
        `option ${optionId} not in contest ${contest.id}`
      );

    case 'yesno':
      return assertFindIndex(
        contest.options,
        (o) => o.id === optionId,
        `option ${optionId} not in contest ${contest.id}`
      );

    default:
      throwIllegalValue(contest, 'type');
  }
}

function parseWriteInIndex(p: { contest: CandidateContest; optionId: string }) {
  const indexStr = p.optionId.substring(WRITE_IN_ID_PREFIX.length);
  assert(/^\d+$/.test(indexStr), `invalid write-in ID: ${p.optionId}`);

  const i = Number.parseInt(indexStr, 10);
  assert(i < p.contest.seats, `write-in index out of bounds: ${p.optionId}`);

  return i;
}
