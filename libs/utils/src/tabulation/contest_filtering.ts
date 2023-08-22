import {
  BallotStyleId,
  ContestId,
  Election,
  ElectionDefinition,
  PrecinctId,
  Tabulation,
  AnyContest,
  Contests,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import {
  createElectionMetadataLookupFunction,
  getBallotStylesByPartyId,
  getBallotStylesByPrecinctId,
  getContestById,
} from './lookups';
import { doesContestAppearOnPartyBallot } from './election_utils';

export function unionSets<T>(sets: Array<Set<T>>): Set<T> {
  const combinedSet = new Set<T>();
  for (const set of sets) {
    for (const item of set) {
      combinedSet.add(item);
    }
  }
  return combinedSet;
}

export function intersectSets<T>(sets: Array<Set<T>>): Set<T> {
  const intersectionSet = new Set<T>();
  if (sets.length === 0) {
    return intersectionSet;
  }
  const firstSet = sets[0];
  assert(firstSet);
  for (const item of firstSet) {
    if (sets.every((set) => set.has(item))) {
      intersectionSet.add(item);
    }
  }
  return intersectionSet;
}

function buildBallotStyleContestIdsLookup(
  election: Election
): Record<BallotStyleId, Set<ContestId>> {
  const lookup: Record<BallotStyleId, Set<ContestId>> = {};
  for (const ballotStyle of election.ballotStyles) {
    const bsDistricts = new Set(ballotStyle.districts);
    const contestIds = election.contests
      .filter(
        (c) =>
          bsDistricts.has(c.districtId) &&
          doesContestAppearOnPartyBallot(c, ballotStyle.partyId)
      )
      .map((c) => c.id);
    lookup[ballotStyle.id] = new Set(contestIds);
  }
  return lookup;
}

export const getContestIdsForBallotStyle = createElectionMetadataLookupFunction(
  buildBallotStyleContestIdsLookup
);

function buildPartyContestIdsLookup(
  election: Election
): Record<string, Set<ContestId>> {
  const lookup: Record<string, Set<ContestId>> = {};
  for (const party of election.parties) {
    lookup[party.id] = new Set(
      election.contests
        .filter((c) => doesContestAppearOnPartyBallot(c, party.id))
        .map((c) => c.id)
    );
  }
  return lookup;
}

export const getContestIdsForParty = createElectionMetadataLookupFunction(
  buildPartyContestIdsLookup
);

function buildPrecinctContestIdsLookup(
  election: Election
): Record<PrecinctId, Set<ContestId>> {
  const lookup: Record<PrecinctId, Set<ContestId>> = {};
  const ballotStyleContestIdsLookup =
    buildBallotStyleContestIdsLookup(election);

  for (const precinct of election.precincts) {
    lookup[precinct.id] = new Set();
  }

  // for each ballot style, add all its contests to its associated precincts' list of contests
  for (const ballotStyle of election.ballotStyles) {
    const ballotStyleContestIds = ballotStyleContestIdsLookup[ballotStyle.id];
    assert(ballotStyleContestIds);
    for (const associatedPrecinctId of ballotStyle.precincts) {
      const associatedPrecinctContestIds = lookup[associatedPrecinctId];
      assert(associatedPrecinctContestIds);
      for (const contestId of ballotStyleContestIds) {
        associatedPrecinctContestIds.add(contestId);
      }
    }
  }
  return lookup;
}

export const getContestIdsForPrecinct = createElectionMetadataLookupFunction(
  buildPrecinctContestIdsLookup
);

export function getBallotStyleIdsForFilter(
  electionDefinition: ElectionDefinition,
  filter?: Tabulation.Filter
): Set<BallotStyleId> {
  const { election } = electionDefinition;

  let ballotStyleIds = new Set(election.ballotStyles.map((bs) => bs.id));
  if (!filter) return ballotStyleIds;

  // Ballot Style, Party, and Precinct filters can all narrow down contests

  // narrow down by explicit Ballot Style filter
  if (filter.ballotStyleIds) {
    ballotStyleIds = intersectSets([
      ballotStyleIds,
      new Set(filter.ballotStyleIds),
    ]);
  }

  // narrow down by Party filter
  if (filter.partyIds) {
    const { partyIds } = filter;
    const ballotStyleIdsRestrictedByParty: Set<BallotStyleId> = unionSets(
      partyIds.map((partyId) => {
        const ballotStyles = getBallotStylesByPartyId(
          electionDefinition,
          partyId
        );
        return new Set(ballotStyles.map((bs) => bs.id));
      })
    );

    ballotStyleIds = intersectSets([
      ballotStyleIds,
      ballotStyleIdsRestrictedByParty,
    ]);
  }

  // narrow down by Precinct filter
  if (filter.precinctIds) {
    const { precinctIds } = filter;
    const ballotStyleIdsRestrictedByPrecinct: Set<BallotStyleId> = unionSets(
      precinctIds.map((precinctId) => {
        const ballotStyles = getBallotStylesByPrecinctId(
          electionDefinition,
          precinctId
        );
        return new Set(ballotStyles.map((bs) => bs.id));
      })
    );

    ballotStyleIds = intersectSets([
      ballotStyleIds,
      ballotStyleIdsRestrictedByPrecinct,
    ]);
  }

  return ballotStyleIds;
}

function getContestIdsForBallotStyleIds(
  electionDefinition: ElectionDefinition,
  ballotStyleIds: BallotStyleId[]
): Set<ContestId> {
  return unionSets(
    ballotStyleIds.map((ballotStyleId) =>
      getContestIdsForBallotStyle(electionDefinition, ballotStyleId)
    )
  );
}

/**
 * Filters can restrict the ballot styles that can appear in a report - if there
 * are no ballot styles in a report, it's not a valid report.
 */
export function getContestIdsForFilter(
  electionDefinition: ElectionDefinition,
  filter?: Tabulation.Filter
): Set<ContestId> {
  return getContestIdsForBallotStyleIds(electionDefinition, [
    ...getBallotStyleIdsForFilter(electionDefinition, filter),
  ]);
}

export function mapContestIdsToContests(
  electionDefinition: ElectionDefinition,
  contestIds: Set<ContestId>
): AnyContest[] {
  return [...contestIds].map((contestId) =>
    getContestById(electionDefinition, contestId)
  );
}

export function convertGroupSpecifierToFilter(
  group: Tabulation.GroupSpecifier
): Tabulation.Filter {
  return {
    ballotStyleIds: group.ballotStyleId ? [group.ballotStyleId] : undefined,
    partyIds: group.partyId ? [group.partyId] : undefined,
    precinctIds: group.precinctId ? [group.precinctId] : undefined,
    scannerIds: group.scannerId ? [group.scannerId] : undefined,
    batchIds: group.batchId ? [group.batchId] : undefined,
    votingMethods: group.votingMethod ? [group.votingMethod] : undefined,
  };
}

export function mergeFilters(
  filter1: Tabulation.Filter,
  filter2: Tabulation.Filter
): Tabulation.Filter {
  return {
    ballotStyleIds:
      filter1.ballotStyleIds || filter2.ballotStyleIds
        ? [...(filter1.ballotStyleIds || []), ...(filter2.ballotStyleIds || [])]
        : undefined,
    partyIds:
      filter1.partyIds || filter2.partyIds
        ? [...(filter1.partyIds || []), ...(filter2.partyIds || [])]
        : undefined,
    precinctIds:
      filter1.precinctIds || filter2.precinctIds
        ? [...(filter1.precinctIds || []), ...(filter2.precinctIds || [])]
        : undefined,
    scannerIds:
      filter1.scannerIds || filter2.scannerIds
        ? [...(filter1.scannerIds || []), ...(filter2.scannerIds || [])]
        : undefined,
    batchIds:
      filter1.batchIds || filter2.batchIds
        ? [...(filter1.batchIds || []), ...(filter2.batchIds || [])]
        : undefined,
    votingMethods:
      filter1.votingMethods || filter2.votingMethods
        ? [...(filter1.votingMethods || []), ...(filter2.votingMethods || [])]
        : undefined,
  };
}

export function getContestsForPrecinct(
  electionDefinition: ElectionDefinition,
  precinctId?: PrecinctId
): Contests {
  const { election } = electionDefinition;
  if (!precinctId) {
    return election.contests;
  }

  const contestIds = getContestIdsForPrecinct(electionDefinition, precinctId);
  return mapContestIdsToContests(electionDefinition, contestIds);
}
