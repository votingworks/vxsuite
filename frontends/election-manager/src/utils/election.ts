import {
  AnyContest,
  BallotLocale,
  Candidate,
  CandidateContest,
  Dictionary,
  Election,
  getContests,
  getPrecinctById,
  Party,
  VotesDict,
  writeInCandidate,
  PartyId,
  BallotStyleId,
  PrecinctId,
} from '@votingworks/types';
import { assert, BallotStyleData, find } from '@votingworks/utils';
import dashify from 'dashify';
import { LANGUAGES } from '../config/globals';

import { sortBy } from './sort_by';

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
  election,
  electionHash,
  precinctId,
  locales,
  isLiveMode,
  isAbsentee,
  variant,
  extension = '.pdf',
}: {
  ballotStyleId: BallotStyleId;
  election: Election;
  electionHash: string;
  precinctId: PrecinctId;
  locales: BallotLocale;
  isLiveMode: boolean;
  isAbsentee: boolean;
  variant?: string;
  extension?: string;
}): string {
  const precinctName = getPrecinctById({
    election,
    precinctId,
  })?.name;
  assert(typeof precinctName !== 'undefined');

  return `election-${electionHash.slice(0, 10)}-precinct-${dashify(
    precinctName
  )}-id-${precinctId}-style-${ballotStyleId}-${getHumanBallotLanguageFormat(
    locales
  ).replace(/[^a-z]+/gi, '-')}-${isLiveMode ? 'live' : 'test'}${
    isAbsentee ? '-absentee' : ''
  }${variant ? `-${variant}` : ''}${extension}`;
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
      .filter((bs) => bs.partyId === c.partyId)
      .flatMap((bs) => bs.districts);
    return districts.includes(c.districtId);
  });
}

interface GenerateTestDeckParams {
  election: Election;
  precinctId?: PrecinctId;
}

export function generateTestDeckBallots({
  election,
  precinctId,
}: GenerateTestDeckParams): Array<Dictionary<string | VotesDict>> {
  const precincts: string[] = precinctId
    ? [precinctId]
    : election.precincts.map((p) => p.id);

  const ballots: Array<Dictionary<string | VotesDict>> = [];

  for (const currentPrecinctId of precincts) {
    const precinct = find(
      election.precincts,
      (p) => p.id === currentPrecinctId
    );
    const precinctBallotStyles = election.ballotStyles.filter((bs) =>
      bs.precincts.includes(precinct.id)
    );

    for (const ballotStyle of precinctBallotStyles) {
      const contests = election.contests.filter(
        (c) =>
          ballotStyle.districts.includes(c.districtId) &&
          ballotStyle.partyId === c.partyId
      );

      const numBallots = Math.max(
        ...contests.map((c) =>
          c.type === 'candidate' ? c.candidates.length : 2
        )
      );

      for (let ballotNum = 0; ballotNum < numBallots; ballotNum += 1) {
        const votes: VotesDict = {};
        for (const contest of contests) {
          if (contest.type === 'yesno') {
            votes[contest.id] = ballotNum % 2 === 0 ? ['yes'] : ['no'];
          } else if (contest.type === 'ms-either-neither') {
            votes[contest.eitherNeitherContestId] =
              ballotNum % 2 === 0 ? ['yes'] : ['no'];
            votes[contest.pickOneContestId] =
              ballotNum % 2 === 0 ? ['yes'] : ['no'];
          } else if (
            contest.type === 'candidate' &&
            contest.candidates.length > 0 // safety check
          ) {
            votes[contest.id] = [
              contest.candidates[ballotNum % contest.candidates.length],
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
}): Array<Dictionary<string | VotesDict>> {
  const ballots: Array<Dictionary<string | VotesDict>> = [];

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
}): Dictionary<string | VotesDict> | undefined {
  const precinctBallotStyles = election.ballotStyles.filter((bs) =>
    bs.precincts.includes(precinctId)
  );

  const ballot: Dictionary<string | VotesDict> = { precinctId };
  const votes: VotesDict = {};

  for (const ballotStyle of precinctBallotStyles) {
    ballot.ballotStyleId = ballotStyle.id;
    const contests = election.contests.filter(
      (c) =>
        ballotStyle.districts.includes(c.districtId) &&
        ballotStyle.partyId === c.partyId
    );

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
        ballot.votes = votes;
        return ballot;
      }
    }

    for (const otherContest of otherContests) {
      if (otherContest.type === 'yesno') {
        votes[otherContest.id] = ['yes', 'no'];
      } else if (otherContest.type === 'ms-either-neither') {
        votes[otherContest.eitherNeitherContestId] = ['yes', 'no'];
      }
      ballot.votes = votes;
      return ballot;
    }
  }
}
