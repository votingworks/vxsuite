import {
  assert,
  assertDefined,
  find,
  throwIllegalValue,
} from '@votingworks/basics';
import {
  AnyContest,
  HmpbBallotPaperSize,
  BallotStyle,
  BallotStyleId,
  Candidate,
  Contest,
  ContestId,
  ContestLike,
  Contests,
  District,
  DistrictId,
  Election,
  BallotStyleGroup,
  Parties,
  Party,
  PartyId,
  Precinct,
  PrecinctId,
  Vote,
  VotesDict,
  BallotStyleGroupId,
  BmdBallotPaperSize,
  BallotPaperSize,
} from './election';

/**
 * Gets contests which belong to a ballot style in an election.
 */
export function getContests({
  ballotStyle,
  election,
}: {
  ballotStyle: BallotStyle | BallotStyleGroup;
  election: Election;
}): Contests {
  return election.contests.filter(
    (c) =>
      ballotStyle.districts.includes(c.districtId) &&
      (c.type !== 'candidate' ||
        !c.partyId ||
        ballotStyle.partyId === c.partyId)
  );
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
 * Retrieves a precinct index by precinct id.
 */
export function getPrecinctIndexById({
  election,
  precinctId,
}: {
  election: Election;
  precinctId: PrecinctId;
}): number {
  return election.precincts.findIndex((p) => p.id === precinctId);
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
  contests: Contests;
  contestId: ContestId;
}): AnyContest | undefined {
  return contests.find((c) => c.id === contestId);
}

/**
 * Gets all contests whose IDs are in the given array.
 */
export function getContestsFromIds(
  election: Election,
  contestIds: readonly ContestId[]
): Contests {
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
 * Gets a description of all the parties for a given candidate. If in the future
 * the order of the parties changes according to the election, this function
 * will need to be updated.
 */
export function getCandidatePartiesDescription(
  election: Election,
  candidate: Candidate
): string | undefined {
  const parties = getCandidateParties(election.parties, candidate);
  if (parties.length === 0) {
    return undefined;
  }
  return parties.map((p) => p.name).join(', ');
}

/**
 * Validates the votes for a given ballot style in a given election.
 *
 * @throws When an inconsistency is found.
 */
export function validateVotes({
  votes,
  ballotStyle,
  election,
}: {
  votes: VotesDict;
  ballotStyle: BallotStyle;
  election: Election;
}): void {
  const contests = getContests({ election, ballotStyle });

  for (const contestId of Object.getOwnPropertyNames(votes)) {
    const contest = findContest({ contests, contestId });

    if (!contest) {
      throw new Error(
        `found a vote with contest id ${JSON.stringify(
          contestId
        )}, but no such contest exists in ballot style ${
          ballotStyle.id
        } (expected one of ${contests.map((c) => c.id).join(', ')})`
      );
    }
  }
}

/**
 * @deprecated Does not support i18n. 'party.fullname` should be used instead.
 * Gets the adjective used to describe the political party for a primary
 * election, e.g. "Republican" or "Democratic".
 */
export function getPartyPrimaryAdjectiveFromBallotStyle({
  ballotStyleId,
  election,
}: {
  ballotStyleId: BallotStyleId;
  election: Election;
}): string {
  const parts = /(\d+)(\w+)/i.exec(ballotStyleId);
  const abbrev = parts?.[2];
  const party = election.parties.find((p) => p.abbrev === abbrev);
  const name = party?.name;
  return (name === 'Democrat' && 'Democratic') || name || '';
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
 * Gets the full name of the political party for a primary election,
 * e.g. "Republican Party" or "Democratic Party".
 */
export function getPartyFullNameFromBallotStyle({
  ballotStyleId,
  election,
}: {
  ballotStyleId: BallotStyleId;
  election: Election;
}): string {
  const party = getPartyForBallotStyle({ ballotStyleId, election });
  return party?.fullName ?? '';
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

export function getDistrictIdsForPartyId(
  election: Election,
  partyId: PartyId
): DistrictId[] {
  return election.ballotStyles
    .filter((bs) => bs.partyId === partyId)
    .flatMap((bs) => bs.districts);
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
 * Returns an array of party ids present in ballot styles in the given election.
 * In the case of a ballot style without a party the element "undefined" will be included
 * in the returned array.
 */
export function getPartyIdsInBallotStyles(
  election: Election
): Array<PartyId | undefined> {
  return Array.from(new Set(election.ballotStyles.map((bs) => bs.partyId)));
}

export function getContestDistrict(
  election: Election,
  contest: ContestLike
): District {
  const district = election.districts.find((d) => d.id === contest.districtId);
  // istanbul ignore next
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
  contests: Contests,
  shorthand: {
    [key: string]: Vote | string | readonly string[] | Candidate;
  }
): VotesDict {
  const votes: VotesDict = {};
  for (const contest of contests) {
    const choice = shorthand[contest.id];
    if (!choice) {
      votes[contest.id] = [];
    } else if (contest.type === 'yesno') {
      assert(Array.isArray(choice), 'yesno shorthand must be an array');
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
export const ELECTION_PACKAGE_HASH_DISPLAY_LENGTH = 7;

export function formatBallotHash(ballotHash: string): string {
  return ballotHash.slice(0, BALLOT_HASH_DISPLAY_LENGTH);
}

export function formatElectionPackageHash(electionPackageHash: string): string {
  return electionPackageHash.slice(0, ELECTION_PACKAGE_HASH_DISPLAY_LENGTH);
}

/**
 * Formats the election package hash and the ballot hash for display to users by
 * shortening and concatenating them (with a hyphen separator).
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
    case HmpbBallotPaperSize.Custom21:
      return {
        width: 8.5,
        height: 21,
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
    /* istanbul ignore next */
    default:
      return throwIllegalValue(paperSize);
  }
}
