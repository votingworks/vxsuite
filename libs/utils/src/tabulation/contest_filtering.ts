import {
  BallotStyleId,
  ContestId,
  Election,
  ElectionDefinition,
  PrecinctId,
  AnyContest,
  Contests,
  PrecinctSelection,
  PartyId,
  getPartyIdsWithContests,
  getContests,
} from '@votingworks/types';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
import { createElectionMetadataLookupFunction } from './lookups';

function buildBallotStyleContestIdsLookup(
  election: Election
): Record<BallotStyleId, Set<ContestId>> {
  const lookup: Record<BallotStyleId, Set<ContestId>> = {};
  for (const ballotStyle of election.ballotStyles) {
    const contests = getContests({ election, ballotStyle });
    lookup[ballotStyle.id] = new Set(contests.map((c) => c.id));
  }
  return lookup;
}

export const getContestIdsForBallotStyle = createElectionMetadataLookupFunction(
  buildBallotStyleContestIdsLookup
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

export function mapContestIdsToContests(
  electionDefinition: ElectionDefinition,
  contestIds: Set<ContestId>
): AnyContest[] {
  return electionDefinition.election.contests.filter((c) =>
    contestIds.has(c.id)
  );
}

export function getContestsForPrecinct(
  electionDefinition: ElectionDefinition,
  precinctSelection: PrecinctSelection
): Contests {
  const { election } = electionDefinition;
  if (precinctSelection.kind === 'AllPrecincts') {
    return election.contests;
  }

  const contestIds = getContestIdsForPrecinct(
    electionDefinition,
    precinctSelection.precinctId
  );
  return mapContestIdsToContests(electionDefinition, contestIds);
}

/**
 * An alternative to getContestsForPrecinct that takes an Election instead of an ElectionDefinition.
 * This is useful in contexts where we don't have an ElectionDefinition, such as the VxDesign app.
 */
export function getContestsForPrecinctAndElection(
  election: Election,
  precinctSelection: PrecinctSelection
): Contests {
  if (precinctSelection.kind === 'AllPrecincts') {
    return election.contests;
  }

  const lookupPrecinctToContestId = buildPrecinctContestIdsLookup(election);
  const contestIds = lookupPrecinctToContestId[precinctSelection.precinctId];

  return election.contests.filter((c) => assertDefined(contestIds).has(c.id));
}

export interface PartyWithContests {
  partyId?: PartyId; // undefined for non-partisan contests
  partyName?: string;
  contests: Contests;
}

export function groupContestsByParty(
  election: Election,
  contests: Contests
): PartyWithContests[] {
  return getPartyIdsWithContests(election).map((partyId) => ({
    partyId,
    // eslint-disable-next-line array-callback-return
    contests: contests.filter((c) => {
      switch (c.type) {
        case 'candidate':
          return c.partyId === partyId;
        case 'yesno':
          return !partyId; // all yes/no contests are non-partisan
        case 'straight-party':
          return !partyId;
        default:
          /* istanbul ignore next - @preserve */
          throwIllegalValue(c);
      }
    }),
  }));
}
