import {
  BallotStyleId,
  ContestId,
  Election,
  ElectionDefinition,
  PrecinctId,
  AnyContest,
  Contests,
} from '@votingworks/types';
import { assert } from '@votingworks/basics';
import {
  createElectionMetadataLookupFunction,
  getContestById,
} from './lookups';

/**
 * Contests appear on ballots or not based on the district the contest is
 * associated with and the party. This function just covers the party part. Rules:
 *   - ballot measures can appear on ballots of any party
 *   - candidates contests with an associated party can only appear on ballots of the same party
 */
export function doesContestAppearOnPartyBallot(
  contest: AnyContest,
  ballotPartyId?: string
): boolean {
  return (
    contest.type === 'yesno' ||
    !contest.partyId ||
    contest.partyId === ballotPartyId
  );
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
  return [...contestIds].map((contestId) =>
    getContestById(electionDefinition, contestId)
  );
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
