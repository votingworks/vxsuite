import {
  assert,
  assertDefined,
  deepEqual,
  find,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  type Contest,
  HmpbBallotPaperSize,
  type BallotStyle,
  type BallotStyleId,
  type Candidate,
  type CandidateContest,
  type ContestId,
  type District,
  type Election,
  type BallotStyleGroup,
  type Parties,
  type Party,
  type PartyId,
  type Precinct,
  type PrecinctId,
  type Vote,
  type VotesDict,
  type BallotStyleGroupId,
  BmdBallotPaperSize,
  type BallotPaperSize,
  hasSplits,
  type PrecinctOrSplit,
  type CandidateVote,
  type OptionalCandidateOrderings,
} from './election.js';

/**
 * Gets contests which belong to a ballot style in an election.
 */
export function getContests({
  ballotStyle,
  election,
}: {
  ballotStyle: BallotStyle | BallotStyleGroup;
  election: Election;
}): readonly Contest[] {
  return election.contests.filter(
    (contest) =>
      ballotStyle.districts.includes(contest.districtId) &&
      // In closed primary elections, where each ballot style has a specific
      // party, filter candidate contests by party (if they have one).
      (ballotStyle.partyId && contest.type === 'candidate'
        ? !contest.partyId || contest.partyId === ballotStyle.partyId
        : true)
  );
}

/**
 * Returns the contest's candidates in the order specified for ballot rotation,
 * or in their original order if no rotation is specified.
 */
export function getOrderedCandidates(p: {
  contest: CandidateContest;
  orderings: OptionalCandidateOrderings;
}): readonly Candidate[] {
  const candidateOrdering = p.orderings?.[p.contest.id];
  if (!candidateOrdering) return p.contest.candidates;

  return candidateOrdering.map(({ id, partyIds }) => {
    const candidate = assertDefined(
      p.contest.candidates.find((c) => c.id === id)
    );
    if (!partyIds) {
      return candidate;
    }
    // If the OrderedCandidateOption has partyIds specified, return a candidate with those specific partyIds
    // This enables cross-endorsed candidates to appear multiple times with different party affiliations
    return {
      ...candidate,
      partyIds,
    };
  });
}

export function getSortedCandidateVote(p: {
  contest: CandidateContest;
  inputVote: CandidateVote;
  orderings: OptionalCandidateOrderings;
}): CandidateVote {
  const orderedCandidates = getOrderedCandidates(p);

  return [...p.inputVote].sort((a, b) => {
    const aIndex = orderedCandidates.findIndex((c) => deepEqual(a, c));
    const bIndex = orderedCandidates.findIndex((c) => deepEqual(b, c));

    // If both are in orderedCandidates, sort by their position
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    // A write in candidate is always ordered last and will not be in orderedCandidates

    // If only a is in orderedCandidates, a comes first
    if (aIndex !== -1) {
      return -1;
    }

    // If only b is in orderedCandidates, b comes first
    if (bIndex !== -1) {
      return 1;
    }

    // Both are not in orderedCandidates, preserve original order
    return 0;
  });
}

/**
 * Retrieves a precinct by id.
 */
export function getPrecinctById({
  election,
  precinctId,
}: {
  election: Election;
  precinctId: PrecinctId;
}): Precinct | undefined {
  return election.precincts.find((p) => p.id === precinctId);
}

/**
 * Retrieves a ballot style by id.
 */
export function getBallotStyle({
  ballotStyleId,
  election,
}: {
  ballotStyleId: BallotStyleId;
  election: Election;
}): BallotStyle | undefined {
  return election.ballotStyles.find((bs) => bs.id === ballotStyleId);
}

/**
 * Retrieves a group ballot style id by ballot style id.
 */
export function getGroupIdFromBallotStyleId({
  ballotStyleId,
  election,
}: {
  ballotStyleId: BallotStyleId;
  election: Election;
}): BallotStyleGroupId {
  const ballotStyle = assertDefined(
    getBallotStyle({ ballotStyleId, election })
  );
  return ballotStyle.groupId;
}

/**
 * Retrieve a contest from a set of contests based on ID
 */
export function findContest({
  contests,
  contestId,
}: {
  contests: readonly Contest[];
  contestId: ContestId;
}): Contest | undefined {
  return contests.find((c) => c.id === contestId);
}

/**
 * Gets all contests whose IDs are in the given array.
 */
export function getContestsFromIds(
  election: Election,
  contestIds: readonly ContestId[]
): readonly Contest[] {
  return Array.from(new Set(contestIds)).map((id) => {
    const contest = election.contests.find((c) => c.id === id);
    if (!contest) {
      throw new Error(`Contest ${id} not found`);
    }
    return contest;
  });
}

/**
 * Gets all parties for a given candidate.
 */
export function getCandidateParties(
  parties: Parties,
  candidate: Candidate
): Parties {
  if (!candidate.partyIds) {
    return [];
  }

  return candidate.partyIds.map((id) => {
    const party = parties.find((p) => p.id === id);
    if (!party) {
      throw new Error(`Party ${id} not found`);
    }
    return party;
  });
}

/**
 * Gets the party for a ballot style, if any.
 */
export function getPartyForBallotStyle({
  ballotStyleId,
  election,
}: {
  ballotStyleId: BallotStyleId;
  election: Election;
}): Party | undefined {
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  return election.parties.find((p) => p.id === ballotStyle?.partyId);
}

/**
 * Gets the abbreviation of the political party for a primary election,
 * e.g. "R" or "D".
 */
export function getPartyAbbreviationByPartyId({
  partyId,
  election,
}: {
  partyId: PartyId;
  election: Election;
}): string {
  const party = election.parties.find((p) => p.id === partyId);
  return party?.abbrev ?? '';
}

/**
 * Returns the ids of all parties with an associated contest defined. Will
 * return `undefined` for nonpartisan contests.
 */
export function getPartyIdsWithContests(
  election: Election
): Array<PartyId | undefined> {
  return [
    ...new Set(
      election.contests.map((c) =>
        c.type === 'candidate' ? c.partyId : undefined
      )
    ),
  ];
}

/**
 * A combined ballot primary is a primary election where ballot styles don't have a
 * partyId, meaning voters choose which party's contests to vote in at the
 * polls rather than being assigned a party ballot.
 */
export function isCombinedBallotPrimary(election: Election): boolean {
  return (
    election.type === 'primary' &&
    // We only need to check the first ballot style, since election validation
    // guarantees that either all ballot styles have a partyId or none do.
    election.ballotStyles.length > 0 &&
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    !election.ballotStyles[0]!.partyId
  );
}

export function getContestDistrict(
  election: Election,
  contest: Pick<Contest, 'districtId'>
): District {
  const district = election.districts.find((d) => d.id === contest.districtId);
  // @coverage-exclude
  if (!district) {
    throw new Error(
      `Contest's associated district ${contest.districtId} not found.`
    );
  }

  return district;
}

export function getContestDistrictName(
  election: Election,
  contest: Contest
): string {
  return getContestDistrict(election, contest).name;
}

/**
 * Helper function to build a `VotesDict` more easily, primarily for testing.
 *
 * @param contests The contests the voter voted in, probably from `getContests`.
 * @param shorthand A mapping of contest id to "vote", where a vote can be a
 * `Vote`, the string id of a candidate, multiple string ids for candidates, or
 * just a `Candidate` by itself.
 *
 * @example
 *
 * // Vote by candidate id.
 * vote(contests, { president: 'boone-lian' })
 *
 * // Vote by yesno contest.
 * vote(contests, { 'question-a': 'question-a-option-yes' })
 *
 * // Multiple votes.
 * vote(contests, {
 *   president: 'boone-lian',
 *   'question-a': 'question-a-option-yes'
 * })
 *
 * // Multiple candidate selections.
 * vote(contests, {
 *   'city-council': ['rupp', 'davis']
 * })
 */
export function vote(
  contests: readonly Contest[],
  shorthand: {
    [key: string]: Vote | string | readonly string[] | Candidate;
  }
): VotesDict {
  const votes: VotesDict = {};
  for (const contest of contests) {
    const choice = shorthand[contest.id];
    if (!choice) {
      votes[contest.id] = [];
    } else if (contest.type === 'yesno' || contest.type === 'straight-party') {
      assert(
        Array.isArray(choice),
        'yesno/straight-party shorthand must be an array'
      );
      votes[contest.id] = choice;
    } else if (Array.isArray(choice) && typeof choice[0] === 'string') {
      votes[contest.id] = contest.candidates.filter((c) =>
        (choice as readonly string[]).includes(c.id)
      );
    } else if (typeof choice === 'string') {
      votes[contest.id] = [find(contest.candidates, (c) => c.id === choice)];
    } else {
      votes[contest.id] = Array.isArray(choice) ? choice : [choice];
    }
  }

  if (
    Object.keys(shorthand).some(
      (shorthandContestId) => !contests.some((c) => c.id === shorthandContestId)
    )
  ) {
    throw new Error('unknown contest specified in vote shorthand');
  }
  return votes;
}

export function isVotePresent(v?: Vote): boolean {
  return !!v && v.length > 0;
}

export const BALLOT_HASH_DISPLAY_LENGTH = 7;
export const CONFIGURATION_PACKAGE_HASH_DISPLAY_LENGTH = 7;

export function formatBallotHash(ballotHash: string): string {
  return ballotHash.slice(0, BALLOT_HASH_DISPLAY_LENGTH);
}

export function formatElectionPackageHash(electionPackageHash: string): string {
  return electionPackageHash.slice(
    0,
    CONFIGURATION_PACKAGE_HASH_DISPLAY_LENGTH
  );
}

/**
 * Formats the configuration package (eg. election package or pollbook package) hash
 * and the ballot hash for display to users by shortening and concatenating them
 * (with a hyphen separator).
 */
export function formatElectionHashes(
  ballotHash: string,
  electionPackageHash: string
): string {
  return `${formatBallotHash(ballotHash)}-${formatElectionPackageHash(
    electionPackageHash
  )}`;
}

// In inches
export function ballotPaperDimensions(paperSize: BallotPaperSize): {
  width: number;
  height: number;
} {
  switch (paperSize) {
    case HmpbBallotPaperSize.Letter:
      return {
        width: 8.5,
        height: 11,
      };
    case HmpbBallotPaperSize.Legal:
      return {
        width: 8.5,
        height: 14,
      };
    case HmpbBallotPaperSize.Custom17:
      return {
        width: 8.5,
        height: 17,
      };
    case HmpbBallotPaperSize.Custom18:
      return {
        width: 8.5,
        height: 18,
      };
    case HmpbBallotPaperSize.Custom19:
      return {
        width: 8.5,
        height: 19,
      };
    case HmpbBallotPaperSize.Custom20:
      return {
        width: 8.5,
        height: 20,
      };
    case HmpbBallotPaperSize.Custom22:
      return {
        width: 8.5,
        height: 22,
      };
    case BmdBallotPaperSize.Vsap150Thermal:
      return {
        width: 8,
        height: 13.25,
      };
    default: {
      return throwIllegalValue(paperSize);
    }
  }
}

export function getAllPrecinctsAndSplits(
  election: Election
): PrecinctOrSplit[] {
  const list: PrecinctOrSplit[] = [];

  for (const precinct of election.precincts) {
    if (!hasSplits(precinct)) {
      list.push({ precinct });
      continue;
    }

    for (const split of precinct.splits) list.push({ precinct, split });
  }

  // eslint-disable-next-line vx/no-array-sort-mutation
  list.sort((a, b) => {
    const nameA = a.split?.name || a.precinct.name;
    const nameB = b.split?.name || b.precinct.name;
    return nameA.localeCompare(nameB, 'en-US', {
      ignorePunctuation: true,
      numeric: true,
    });
  });

  return list;
}
