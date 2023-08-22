import { Result, ok, err, find, assertDefined } from '@votingworks/basics';
import { sha256 } from 'js-sha256';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { safeParseCdfBallotDefinition } from './cdf/ballot-definition/convert';
import {
  AnyContest,
  BallotPaperSize,
  BallotStyle,
  BallotStyleId,
  Candidate,
  Contest,
  ContestId,
  Contests,
  DistrictId,
  Election,
  ElectionDefinition,
  ElectionSchema,
  Parties,
  PartyId,
  Precinct,
  PrecinctId,
  Vote,
  VotesDict,
} from './election';
import { safeParseJson, safeParse } from './generic';

/**
 * Gets contests which belong to a ballot style in an election.
 */
export function getContests({
  ballotStyle,
  election,
}: {
  ballotStyle: BallotStyle;
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
): string {
  const parties = getCandidateParties(election.parties, candidate);
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
 * Checks if an election has a ballot style affiliated with a party.
 */
export function electionHasPrimaryBallotStyle(election: Election): boolean {
  return election.ballotStyles.some((bs) => Boolean(bs.partyId));
}

/**
 * Checks if an election has a contest affiliated with a party.
 */
export function electionHasPrimaryContest(election: Election): boolean {
  return election.contests.some(
    (c) => c.type === 'candidate' && Boolean(c.partyId)
  );
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
  const ballotStyle = getBallotStyle({ ballotStyleId, election });
  const party = election.parties.find((p) => p.id === ballotStyle?.partyId);
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
 * Gets the party specific election title for use in reports. Prefixes with
 * the party name or suffixes with "Nonpartisan Contests" if the election is
 * a primary. Simply returns the election title if election is not a primary.
 */
export function getPartySpecificElectionTitle(
  election: Election,
  partyId?: PartyId
): string {
  const party = election.parties.find((p) => p.id === partyId);
  if (party) {
    return `${party.fullName} ${election.title}`;
  }

  if (electionHasPrimaryContest(election)) {
    return `${election.title} Nonpartisan Contests`;
  }

  return election.title;
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

export function getContestDistrictName(
  election: Election,
  contest: Contest
): string {
  const district = election.districts.find((d) => d.id === contest.districtId);
  // istanbul ignore next
  if (!district) {
    throw new Error(
      `Contest's associated district ${contest.districtId} not found.`
    );
  }
  return district.name;
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
 * vote(contests, { 'question-a': 'yes' })
 *
 * // Multiple votes.
 * vote(contests, {
 *   president: 'boone-lian',
 *   'question-a': 'yes'
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
  return Object.getOwnPropertyNames(shorthand).reduce((result, contestId) => {
    const contest = findContest({ contests, contestId });

    if (!contest) {
      throw new Error(`unknown contest ${contestId}`);
    }

    const choice = shorthand[contestId];

    if (contest.type !== 'candidate') {
      return { ...result, [contestId]: choice };
    }
    if (Array.isArray(choice) && typeof choice[0] === 'string') {
      return {
        ...result,
        [contestId]: contest.candidates.filter((c) =>
          (choice as readonly string[]).includes(c.id)
        ),
      };
    }

    if (typeof choice === 'string') {
      return {
        ...result,
        [contestId]: [contest.candidates.find((c) => c.id === choice)],
      };
    }

    return {
      ...result,
      [contestId]: Array.isArray(choice) ? choice : [choice],
    };
  }, {});
}

export function isVotePresent(v?: Vote): boolean {
  return !!v && v.length > 0;
}

/**
 * Pre-process an election definition to make it easier to work with.
 */
function preprocessElection(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }

  // We're casting it here to make it easier to use, but in this function you
  // must assume the type is unknown.
  let election = value as Election;

  // Handle the renamed `sealURL` property.
  /* eslint-disable vx/gts-identifiers */
  if ('sealURL' in value) {
    interface ElectionWithSealURL extends Election {
      readonly sealURL: string;
    }

    const { sealURL, ...rest } = election as ElectionWithSealURL;
    election = { ...rest, sealUrl: sealURL };
  }
  /* eslint-enable vx/gts-identifiers */

  // Convert specific known date formats to ISO 8601.
  if (
    typeof election.date === 'string' &&
    !DateTime.fromISO(election.date).isValid
  ) {
    // e.g. 2/18/2020
    const parsedMonthDayYearDate = DateTime.fromFormat(
      election.date,
      'M/d/yyyy'
    );

    if (parsedMonthDayYearDate.isValid) {
      election = { ...election, date: parsedMonthDayYearDate.toISO() };
    }

    // e.g. February 18th, 2020
    const parsedMonthNameDayYearDate = DateTime.fromFormat(
      election.date.replace(/(\d+)(st|nd|rd|th)/, '$1'),
      'MMMM d, yyyy'
    );

    if (parsedMonthNameDayYearDate.isValid) {
      election = { ...election, date: parsedMonthNameDayYearDate.toISO() };
    }
  }

  // Fill in `Party#fullName` from `Party#name` if it's missing.
  const isMissingPartyFullName = election.parties?.some(
    /* istanbul ignore next */
    (party) => !party?.fullName
  );

  /* istanbul ignore next */
  if (isMissingPartyFullName) {
    election = {
      ...election,
      parties: election.parties?.map((party) =>
        !party
          ? party
          : {
              ...party,
              fullName: party.fullName ?? party.name,
            }
      ),
    };
  }

  if (election.contests) {
    // Handle single `partyId` on candidates.
    interface CandidateWithPartyId extends Candidate {
      readonly partyId?: PartyId;
    }

    const hasPartyId = election.contests.some(
      (contest) =>
        /* istanbul ignore next */
        contest?.type === 'candidate' &&
        contest.candidates.some(
          (candidate: CandidateWithPartyId) => candidate?.partyId
        )
    );

    if (hasPartyId) {
      election = {
        ...election,
        contests: election.contests.map((contest) => {
          /* istanbul ignore next */
          if (contest?.type !== 'candidate' || !contest.candidates) {
            return contest;
          }

          return {
            ...contest,
            candidates: contest.candidates.map(
              (candidate: CandidateWithPartyId) => {
                /* istanbul ignore next */
                if (!candidate?.partyId) {
                  return candidate;
                }

                return {
                  ...candidate,
                  partyIds: [candidate.partyId],
                };
              }
            ),
          };
        }),
      };
    }

    // Fill in required contest yesOption/noOption
    const contests = election.contests.map((contest) => {
      if (contest.type !== 'yesno') return contest;
      return {
        ...contest,
        yesOption: contest.yesOption ?? {
          label: 'Yes',
          id: `${contest.id}-option-yes`,
        },
        noOption: contest.noOption ?? {
          label: 'No',
          id: `${contest.id}-option-no`,
        },
      };
    });
    election = {
      ...election,
      contests,
    };
    /* istanbul ignore next */
    if ('gridLayouts' in election) {
      election = {
        ...election,
        gridLayouts: assertDefined(election.gridLayouts).map((gridLayout) => ({
          ...gridLayout,
          gridPositions: gridLayout.gridPositions.map((gridPosition) => {
            const contest = find(
              contests,
              (c) => c.id === gridPosition.contestId
            );
            if (contest.type !== 'yesno' || gridPosition.type !== 'option') {
              return gridPosition;
            }
            return {
              ...gridPosition,
              optionId:
                gridPosition.optionId === 'yes'
                  ? contest.yesOption.id
                  : gridPosition.optionId === 'no'
                  ? contest.noOption.id
                  : gridPosition.optionId,
            };
          }),
        })),
      };
    }
  }

  if (!('ballotLayout' in election)) {
    election = {
      ...election,
      ballotLayout: {
        paperSize: BallotPaperSize.Letter,
        metadataEncoding: 'qr-code',
      },
    };
  }

  // Add sheetNumber to grid positions
  /* istanbul ignore next */
  if (election.gridLayouts) {
    election = {
      ...election,
      gridLayouts: election.gridLayouts.map((gridLayout) => ({
        ...gridLayout,
        gridPositions: gridLayout.gridPositions.map((gridPosition) => ({
          ...gridPosition,
          sheetNumber: gridPosition.sheetNumber ?? 1,
        })),
      })),
    };
  }

  return election;
}

/**
 * Parses `value` as a VXF `Election` object.
 */
export function safeParseVxfElection(
  value: unknown
): Result<Election, z.ZodError> {
  return safeParse(ElectionSchema, preprocessElection(value));
}

/**
 * Parses `value` as an `Election` object. Supports both VXF and CDF. If given a
 * string, will attempt to parse it as JSON first.
 */
export function safeParseElection(
  value: unknown
): Result<Election, Error | SyntaxError> {
  if (typeof value === 'string') {
    const parsed = safeParseJson(value);
    if (parsed.isErr()) {
      return parsed;
    }
    return safeParseElection(parsed.ok());
  }

  const vxfResult = safeParseVxfElection(value);
  if (vxfResult.isOk()) {
    return vxfResult;
  }

  const cdfResult = safeParseCdfBallotDefinition(value);
  if (cdfResult.isOk()) {
    return cdfResult;
  }

  return err(
    new Error(
      [
        'Invalid election definition',
        `VXF error: ${vxfResult.err()}`,
        `CDF error: ${cdfResult.err()}`,
      ].join('\n\n')
    )
  );
}

/**
 * Parses `value` as a JSON `Election`, computing the election hash if the
 * result is `Ok`.
 */
export function safeParseElectionDefinition(
  value: string
): Result<ElectionDefinition, z.ZodError | SyntaxError> {
  const result = safeParseElection(value);
  return result.isErr()
    ? result
    : ok({
        election: result.ok(),
        electionData: value,
        electionHash: sha256(value),
      });
}

export const ELECTION_HASH_DISPLAY_LENGTH = 10;

export function getDisplayElectionHash(
  electionDefinition: Pick<ElectionDefinition, 'electionHash'>
): string {
  return electionDefinition.electionHash.slice(0, ELECTION_HASH_DISPLAY_LENGTH);
}
