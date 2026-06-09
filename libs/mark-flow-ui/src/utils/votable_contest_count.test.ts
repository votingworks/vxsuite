import { expect, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import {
  electionOpenPrimaryFixtures,
  readElectionGeneral,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import {
  BallotStyleId,
  Election,
  getBallotStyle,
  getContests,
} from '@votingworks/types';
import { getVotableContestCount } from './votable_contest_count';
import { mergeMsEitherNeitherContests } from './ms_either_neither_contests';

function ballotStyle(election: Election, ballotStyleId: BallotStyleId) {
  return assertDefined(getBallotStyle({ election, ballotStyleId }));
}

function mergedContestCount(election: Election, ballotStyleId: BallotStyleId) {
  return mergeMsEitherNeitherContests(
    getContests({ election, ballotStyle: ballotStyle(election, ballotStyleId) })
  ).length;
}

test('counts every contest on the ballot style for general elections', () => {
  const election = readElectionGeneral();
  expect(
    getVotableContestCount({
      election,
      ballotStyle: ballotStyle(election, '12'),
    })
  ).toEqual(mergedContestCount(election, '12'));
});

test('counts every contest on the ballot style for closed primaries', () => {
  const election = readElectionTwoPartyPrimary();
  expect(
    getVotableContestCount({
      election,
      ballotStyle: ballotStyle(election, '1M'),
    })
  ).toEqual(mergedContestCount(election, '1M'));
});

test('counts nonpartisan plus a single party for open primaries', () => {
  const election = electionOpenPrimaryFixtures.readElection();
  // ballot-style-1: 21 partisan contests (7 per party across 3 parties) and 6
  // nonpartisan contests. A voter only votes one party's contests.
  expect(mergedContestCount(election, 'ballot-style-1')).toEqual(27);
  expect(
    getVotableContestCount({
      election,
      ballotStyle: ballotStyle(election, 'ballot-style-1'),
    })
  ).toEqual(6 + 7);
});

test('counts all contests for an open primary with no partisan contests', () => {
  const election = electionOpenPrimaryFixtures.readElection();
  const nonpartisanOnly: Election = {
    ...election,
    contests: election.contests.filter(
      (contest) =>
        !(contest.type === 'candidate' && contest.partyId !== undefined)
    ),
  };

  expect(
    getVotableContestCount({
      election: nonpartisanOnly,
      ballotStyle: ballotStyle(nonpartisanOnly, 'ballot-style-1'),
    })
  ).toEqual(mergedContestCount(nonpartisanOnly, 'ballot-style-1'));
});

test('throws for an open primary where parties have unequal partisan contest counts', () => {
  const election = electionOpenPrimaryFixtures.readElection();
  const firstPartisanContest = assertDefined(
    election.contests.find(
      (contest) => contest.type === 'candidate' && contest.partyId !== undefined
    )
  );
  // Drop one party's contest so the parties no longer have matching partisan
  // contest counts.
  const unbalanced: Election = {
    ...election,
    contests: election.contests.filter(
      (contest) => contest !== firstPartisanContest
    ),
  };

  expect(() =>
    getVotableContestCount({
      election: unbalanced,
      ballotStyle: ballotStyle(unbalanced, 'ballot-style-1'),
    })
  ).toThrow(
    'Expected every party to have the same number of partisan contests in an open primary'
  );
});
