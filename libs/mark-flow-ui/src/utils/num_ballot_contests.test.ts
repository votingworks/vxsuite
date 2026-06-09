import { expect, test } from 'vitest';
import { assertDefined } from '@votingworks/basics';
import {
  electionOpenPrimaryFixtures,
  readElectionGeneral,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import { BallotStyleId, getBallotStyle, getContests } from '@votingworks/types';
import { getNumBallotContests } from './num_ballot_contests';
import { mergeMsEitherNeitherContests } from './ms_either_neither_contests';

function contestsForBallotStyle(
  election: Parameters<typeof getContests>[0]['election'],
  ballotStyleId: BallotStyleId
) {
  const ballotStyle = assertDefined(
    getBallotStyle({ election, ballotStyleId })
  );
  return mergeMsEitherNeitherContests(getContests({ election, ballotStyle }));
}

test('returns the contest count directly for general elections', () => {
  const election = readElectionGeneral();
  const contests = contestsForBallotStyle(election, '12');
  expect(getNumBallotContests(election, contests)).toEqual(contests.length);
});

test('returns the contest count directly for closed primaries', () => {
  const election = readElectionTwoPartyPrimary();
  const contests = contestsForBallotStyle(election, '1M');
  expect(getNumBallotContests(election, contests)).toEqual(contests.length);
});

test('counts nonpartisan plus a single party for open primaries', () => {
  const election = electionOpenPrimaryFixtures.readElection();
  // The full contest list contains every party's partisan contests, since the
  // voter hasn't selected a party yet.
  const contests = contestsForBallotStyle(election, 'ballot-style-1');

  // ballot-style-1: 21 partisan contests (7 per party across 3 parties) and 6
  // nonpartisan contests.
  expect(contests).toHaveLength(27);
  expect(getNumBallotContests(election, contests)).toEqual(6 + 7);
});

test('counts all contests for an open primary with no partisan contests', () => {
  const election = electionOpenPrimaryFixtures.readElection();
  const nonpartisanContests = contestsForBallotStyle(
    election,
    'ballot-style-1'
  ).filter(
    (contest) =>
      !(contest.type === 'candidate' && contest.partyId !== undefined)
  );

  expect(getNumBallotContests(election, nonpartisanContests)).toEqual(
    nonpartisanContests.length
  );
});

test('throws for an open primary where parties have unequal partisan contest counts', () => {
  const election = electionOpenPrimaryFixtures.readElection();
  const contests = contestsForBallotStyle(election, 'ballot-style-1');
  const firstPartisanContest = assertDefined(
    contests.find(
      (contest) => contest.type === 'candidate' && contest.partyId !== undefined
    )
  );
  // Drop one party's contest so the parties no longer have matching partisan
  // contest counts.
  const unbalancedContests = contests.filter(
    (contest) => contest !== firstPartisanContest
  );

  expect(() => getNumBallotContests(election, unbalancedContests)).toThrow(
    'Expected every party to have the same number of partisan contests in an open primary'
  );
});
