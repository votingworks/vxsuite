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
} from '@votingworks/types';
import { assert, assertDefined, throwIllegalValue } from '@votingworks/basics';
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
    contest.type === 'straight-party' ||
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
          (c.type === 'straight-party' || bsDistricts.has(c.districtId)) &&
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

  const lookupContestIdToContest: Record<ContestId, AnyContest> = {};
  for (const contest of election.contests) {
    lookupContestIdToContest[contest.id] = contest;
  }

  return Array.from(assertDefined(contestIds))
    .map((id) => lookupContestIdToContest[id])
    .filter((c): c is AnyContest => c !== undefined);
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
        /* istanbul ignore next - @preserve */
        default:
          throwIllegalValue(c);
      }
    }),
  }));
}
