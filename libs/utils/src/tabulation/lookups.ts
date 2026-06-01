import { assert, assertDefined } from '@votingworks/basics';
import {
  AnyContest,
  BallotStyle,
  BallotStyleGroupId,
  BallotStyleId,
  District,
  Election,
  ElectionDefinition,
  BallotStyleGroup,
  Party,
  Precinct,
  PrecinctId,
  getBallotStyle,
  ContestId,
} from '@votingworks/types';
import { getGroupedBallotStyles } from '../ballot_styles';
import { allContestOptionsWithMultiEndorsements } from '../hmpb/all_contest_options';

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
  (election) => {
    const { districts } = election;
    const districtLookup: Record<string, District> = {};
    for (const district of districts) {
      districtLookup[district.id] = district;
    }
    return districtLookup;
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
    const lookup: Record<string, AnyContest> = {};
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
 * A helper type for caching option positions.
 * Maps ballotStyleId -> contestId -> optionId -> position
 */
type OptionPositionLookup = Record<
  BallotStyleId,
  Record<ContestId, Record<string, number>>
>;

/**
 * Builds a lookup map for option positions on the ballot for all contests
 * in a specific ballot style. This respects ballot style-specific candidate ordering.
 * For multi-endorsed candidates, always returns the position of the first occurrence.
 * This is used internally by getOptionPosition and is cached.
 */
function buildOptionPositionLookupForBallotStyle(
  election: Election,
  ballotStyleId: BallotStyleId
): Record<string, Record<string, number>> {
  const ballotStyle = assertDefined(
    getBallotStyle({ ballotStyleId, election }),
    `Ballot style ${ballotStyleId} not found`
  );

  const lookup: Record<string, Record<string, number>> = {};
  for (const contest of election.contests) {
    const contestMap: Record<string, number> = {};
    let position = 0;

    // Iterate through all options in ballot order, including multi-endorsed duplicates
    for (const option of allContestOptionsWithMultiEndorsements(
      contest,
      ballotStyle,
      election.parties
    )) {
      // For multi-endorsed candidates, only store the first occurrence
      if (contestMap[option.id] === undefined) {
        contestMap[option.id] = position;
      }
      position += 1;
    }

    lookup[contest.id] = contestMap;
  }
  return lookup;
}

// Cache for option position lookups by ballot hash and ballot style
const optionPositionLookupCache: Record<string, OptionPositionLookup> = {};

/**
 * Gets the zero-indexed position of a contest option on the ballot for a specific ballot style.
 * For candidates, this is the position in the ballot-style-specific candidate ordering.
 * For multi-endorsed candidates that appear multiple times, returns the first occurrence.
 * For yes/no contests, yes=0 and no=1.
 * For write-ins, positions are after all candidates.
 *
 * This function builds and caches the position map on first call for each election and ballot style.
 */
export function getOptionPosition(
  electionDefinition: ElectionDefinition,
  ballotStyleId: BallotStyleId,
  contestId: string,
  optionId: string
): number {
  const { ballotHash } = electionDefinition;

  // Check if we have the lookup cached for this election
  let electionLookup = optionPositionLookupCache[ballotHash];
  if (!electionLookup) {
    electionLookup = {};
    optionPositionLookupCache[ballotHash] = electionLookup;
  }

  // Check if we have the lookup cached for this ballot style
  let ballotStyleLookup = electionLookup[ballotStyleId];
  if (!ballotStyleLookup) {
    // Build and cache the lookup for this ballot style
    ballotStyleLookup = buildOptionPositionLookupForBallotStyle(
      electionDefinition.election,
      ballotStyleId
    );
    electionLookup[ballotStyleId] = ballotStyleLookup;
  }

  const contestOptions = ballotStyleLookup[contestId];
  assert(
    contestOptions,
    `Contest ${contestId} not found in option position lookup for ballot style ${ballotStyleId}`
  );

  const position = contestOptions[optionId];
  assert(
    position !== undefined,
    `Option ${optionId} not found in contest ${contestId} for ballot style ${ballotStyleId}`
  );

  return position;
}
