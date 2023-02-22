import { Admin } from '@votingworks/api';
import {
  AnyContest,
  BallotLocale,
  Candidate,
  CandidateContest,
  Election,
  getContests,
  getPrecinctById,
  Party,
  VotesDict,
  writeInCandidate,
  PartyId,
  BallotStyleId,
  PrecinctId,
  WriteInCandidate,
  YesNoVote,
  ElectionDefinition,
  getDisplayElectionHash,
} from '@votingworks/types';
import { assert, find } from '@votingworks/basics';
import { BallotStyleData } from '@votingworks/utils';
import dashify from 'dashify';
import { LANGUAGES } from '../config/globals';

import { sortBy } from './sort_by';

export interface TestDeckBallot {
  ballotStyleId: BallotStyleId;
  precinctId: PrecinctId;
  votes: VotesDict;
}

export function getDistrictIdsForPartyId(
  election: Election,
  partyId: PartyId
): string[] {
  return election.ballotStyles
    .filter((bs) => bs.partyId === partyId)
    .flatMap((bs) => bs.districts);
}

export function getPartiesWithPrimaryElections(election: Election): Party[] {
  const partyIds = election.ballotStyles
    .map((bs) => bs.partyId)
    .filter((id): id is PartyId => id !== undefined);
  return election.parties.filter((party) => partyIds.includes(party.id));
}

const sortOptions: Intl.CollatorOptions = {
  ignorePunctuation: true,
  numeric: true,
};

export function getBallotStylesData(election: Election): BallotStyleData[] {
  return election.ballotStyles.flatMap((ballotStyle) =>
    ballotStyle.precincts.map<BallotStyleData>((precinctId) => ({
      ballotStyleId: ballotStyle.id,
      precinctId,
      contestIds: getContests({ ballotStyle, election }).map((c) => c.id),
    }))
  );
}

const superBallotStyleId = 'vx-super-ballot';
const superBallotStylePrecinctId = 'vx-all-precincts';

/**
 * Generates the data necessary to render a super ballot, a special ballot only available to system
 * admins that includes all contests across all precincts
 */
export function getSuperBallotStyleData(election: Election): BallotStyleData {
  return {
    ballotStyleId: superBallotStyleId,
    contestIds: election.contests.map((c) => c.id),
    precinctId: superBallotStylePrecinctId,
  };
}

/**
 * Returns whether a ballot style ID corresponds to the super ballot, a special ballot only
 * available to system admins that includes all contests across all precincts
 */
export function isSuperBallotStyle(ballotStyleId: BallotStyleId): boolean {
  return ballotStyleId === superBallotStyleId;
}

function ballotStyleComparator(a: BallotStyleData, b: BallotStyleData) {
  return a.ballotStyleId.localeCompare(b.ballotStyleId, undefined, sortOptions);
}

function makePrecinctComparator(election: Election) {
  return (a: BallotStyleData, b: BallotStyleData) =>
    find(election.precincts, (p) => p.id === a.precinctId).name.localeCompare(
      find(election.precincts, (p) => p.id === b.precinctId).name,
      undefined,
      sortOptions
    );
}

export function sortBallotStyleDataByStyle(
  election: Election,
  styles: readonly BallotStyleData[]
): BallotStyleData[] {
  return sortBy(
    styles,
    ballotStyleComparator,
    makePrecinctComparator(election)
  );
}

export function sortBallotStyleDataByPrecinct(
  election: Election,
  styles: readonly BallotStyleData[]
): BallotStyleData[] {
  return sortBy(
    styles,
    makePrecinctComparator(election),
    ballotStyleComparator
  );
}

export function getBallotStylesDataByStyle(
  election: Election
): BallotStyleData[] {
  return sortBallotStyleDataByStyle(election, getBallotStylesData(election));
}

export function getLanguageByLocaleCode(localeCode: string): string {
  return LANGUAGES[localeCode.split('-')[0]] ?? localeCode;
}

export function getHumanBallotLanguageFormat(locales: BallotLocale): string {
  return !locales.secondary
    ? getLanguageByLocaleCode(locales.primary)
    : `${getLanguageByLocaleCode(locales.primary)}/${getLanguageByLocaleCode(
        locales.secondary
      )}`;
}

export function getBallotPath({
  ballotStyleId,
  electionDefinition,
  precinctId,
  locales,
  ballotMode,
  isAbsentee,
  variant,
  extension = '.pdf',
}: {
  ballotStyleId: BallotStyleId;
  electionDefinition: ElectionDefinition;
  precinctId: PrecinctId;
  locales: BallotLocale;
  ballotMode: Admin.BallotMode;
  isAbsentee: boolean;
  variant?: string;
  extension?: string;
}): string {
  const { election } = electionDefinition;
  const precinctName = isSuperBallotStyle(ballotStyleId)
    ? 'All'
    : getPrecinctById({ election, precinctId })?.name;
  assert(typeof precinctName !== 'undefined');

  return `election-${getDisplayElectionHash(
    electionDefinition
  )}-precinct-${dashify(
    precinctName
  )}-id-${precinctId}-style-${ballotStyleId}-${getHumanBallotLanguageFormat(
    locales
  ).replace(/[^a-z]+/gi, '-')}-${ballotMode}${isAbsentee ? '-absentee' : ''}${
    variant ? `-${variant}` : ''
  }${extension}`;
}

export function getBallotArchiveFilename(
  electionDefinition: ElectionDefinition,
  ballotMode: Admin.BallotMode,
  isAbsentee: boolean
): string {
  return `ballot-pdfs-election-${getDisplayElectionHash(
    electionDefinition
  )}-${ballotMode}${isAbsentee ? '-absentee' : ''}`;
}

export function getAllPossibleCandidatesForCandidateContest(
  contest: CandidateContest
): readonly Candidate[] {
  if (contest.allowWriteIns) {
    return [...contest.candidates, writeInCandidate];
  }
  return contest.candidates;
}

export function getContestsForPrecinct(
  election: Election,
  precinctId: PrecinctId
): AnyContest[] {
  const precinct = election.precincts.find((p) => p.id === precinctId);
  if (precinct === undefined) {
    return [];
  }
  const precinctBallotStyles = election.ballotStyles.filter((bs) =>
    bs.precincts.includes(precinct.id)
  );

  return election.contests.filter((c) => {
    const districts = precinctBallotStyles
      .filter((bs) => {
        const contestPartyId = c.type === 'candidate' ? c.partyId : undefined;
        return bs.partyId === contestPartyId;
      })
      .flatMap((bs) => bs.districts);
    return districts.includes(c.districtId);
  });
}

export function numBallotPositions(contest: AnyContest): number {
  if (contest.type === 'candidate') {
    return (
      contest.candidates.length + (contest.allowWriteIns ? contest.seats : 0)
    );
  }
  return 2;
}

export function generateTestDeckWriteIn(index: number): WriteInCandidate {
  return {
    id: 'write-in',
    isWriteIn: true,
    name: 'WRITE-IN',
    writeInIndex: index,
  };
}

export function getTestDeckCandidateAtIndex(
  contest: CandidateContest,
  position: number
): Candidate {
  assert(position < numBallotPositions(contest)); // safety check
  if (position < contest.candidates.length) {
    return contest.candidates[position];
  }
  return generateTestDeckWriteIn(position - contest.candidates.length);
}

const yesOrNo: YesNoVote[] = [['yes'], ['no']];

interface GenerateTestDeckParams {
  election: Election;
  precinctId?: PrecinctId;
}

export function generateTestDeckBallots({
  election,
  precinctId,
}: GenerateTestDeckParams): TestDeckBallot[] {
  const precincts: string[] = precinctId
    ? [precinctId]
    : election.precincts.map((p) => p.id);

  const ballots: TestDeckBallot[] = [];

  for (const currentPrecinctId of precincts) {
    const precinct = find(
      election.precincts,
      (p) => p.id === currentPrecinctId
    );
    const precinctBallotStyles = election.ballotStyles.filter((bs) =>
      bs.precincts.includes(precinct.id)
    );

    for (const ballotStyle of precinctBallotStyles) {
      const contests = getContests({ election, ballotStyle });

      const numBallots = Math.max(
        ...contests.map((c) => numBallotPositions(c))
      );

      for (let ballotNum = 0; ballotNum < numBallots; ballotNum += 1) {
        const votes: VotesDict = {};
        for (const contest of contests) {
          if (contest.type === 'yesno') {
            votes[contest.id] = yesOrNo[ballotNum % 2];
          } else if (
            contest.type === 'candidate' &&
            contest.candidates.length > 0 // safety check
          ) {
            const choiceIndex = ballotNum % numBallotPositions(contest);
            votes[contest.id] = [
              getTestDeckCandidateAtIndex(contest, choiceIndex),
            ];
          }
        }
        ballots.push({
          ballotStyleId: ballotStyle.id,
          precinctId: currentPrecinctId,
          votes,
        });
      }
    }
  }

  return ballots;
}

export function generateBlankBallots({
  election,
  precinctId,
  numBlanks,
}: {
  election: Election;
  precinctId: PrecinctId;
  numBlanks: number;
}): TestDeckBallot[] {
  const ballots: TestDeckBallot[] = [];

  const blankBallotStyle = election.ballotStyles.find((bs) =>
    bs.precincts.includes(precinctId)
  );

  if (blankBallotStyle && numBlanks > 0) {
    for (let blankNum = 0; blankNum < numBlanks; blankNum += 1) {
      ballots.push({
        ballotStyleId: blankBallotStyle.id,
        precinctId,
        votes: {},
      });
    }
  }

  return ballots;
}

// Generates a minimally overvoted ballot - a single overvote in the first contest where an
// overvote is possible. Does not overvote candidate contests where you must select a write-in
// to overvote. See discussion: https://github.com/votingworks/vxsuite/issues/1711.
//
// In cases where it is not possible to overvote a ballot style, returns undefined.
export function generateOvervoteBallot({
  election,
  precinctId,
}: {
  election: Election;
  precinctId: PrecinctId;
}): TestDeckBallot | undefined {
  const precinctBallotStyles = election.ballotStyles.filter((bs) =>
    bs.precincts.includes(precinctId)
  );

  const votes: VotesDict = {};
  for (const ballotStyle of precinctBallotStyles) {
    const contests = election.contests.filter((c) => {
      const contestPartyId = c.type === 'candidate' ? c.partyId : undefined;
      return (
        ballotStyle.districts.includes(c.districtId) &&
        ballotStyle.partyId === contestPartyId
      );
    });

    const candidateContests = contests.filter(
      (c) => c.type === 'candidate'
    ) as CandidateContest[];
    const otherContests = contests.filter((c) => c.type !== 'candidate');

    for (const candidateContest of candidateContests) {
      if (candidateContest.candidates.length > candidateContest.seats) {
        votes[candidateContest.id] = candidateContest.candidates.slice(
          0,
          candidateContest.seats + 1
        );
        return {
          ballotStyleId: ballotStyle.id,
          precinctId,
          votes,
        };
      }
    }

    if (otherContests.length > 0) {
      const otherContest = otherContests[0];
      if (otherContest.type === 'yesno') {
        votes[otherContest.id] = ['yes', 'no'];
      }
      return {
        ballotStyleId: ballotStyle.id,
        precinctId,
        votes,
      };
    }
  }
  return undefined;
}
