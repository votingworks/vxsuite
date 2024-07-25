import {
  electionPrimaryPrecinctSplitsFixtures,
  electionFamousNames2021Fixtures,
  electionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { find } from '@votingworks/basics';
import {
  doesContestAppearOnPartyBallot,
  getContestIdsForBallotStyle,
  getContestIdsForPrecinct,
  getContestsForPrecinctSelection,
} from './contest_filtering';

describe('doesContestAppearOnPartyBallot', () => {
  test('in a primary election', () => {
    const electionDefinition = electionTwoPartyPrimaryDefinition;

    const { contests } = electionDefinition.election;
    const mammalContest = find(contests, (c) => c.id === 'best-animal-mammal');
    const fishContest = find(contests, (c) => c.id === 'best-animal-fish');
    const ballotMeasure = find(contests, (c) => c.id === 'fishing');

    expect(doesContestAppearOnPartyBallot(mammalContest, '0')).toEqual(true);
    expect(doesContestAppearOnPartyBallot(mammalContest, '1')).toEqual(false);

    expect(doesContestAppearOnPartyBallot(fishContest, '0')).toEqual(false);
    expect(doesContestAppearOnPartyBallot(fishContest, '1')).toEqual(true);

    expect(doesContestAppearOnPartyBallot(ballotMeasure, '0')).toEqual(true);
    expect(doesContestAppearOnPartyBallot(ballotMeasure, '1')).toEqual(true);
  });

  test('in a general election', () => {
    const { electionDefinition } = electionFamousNames2021Fixtures;

    const { contests } = electionDefinition.election;
    const generalElectionCandidateContest = find(
      contests,
      (c) => c.type === 'candidate'
    );

    expect(
      doesContestAppearOnPartyBallot(generalElectionCandidateContest)
    ).toEqual(true);
  });
});

test('getContestIdsForBallotStyle', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  expect([...getContestIdsForBallotStyle(electionDefinition, '1M')]).toEqual([
    'best-animal-mammal',
    'zoo-council-mammal',
    'new-zoo-either',
    'new-zoo-pick',
    'fishing',
  ]);
  expect([...getContestIdsForBallotStyle(electionDefinition, '2F')]).toEqual([
    'best-animal-fish',
    'aquarium-council-fish',
    'new-zoo-either',
    'new-zoo-pick',
    'fishing',
  ]);
});

test('getContestIdsForPrecinct', () => {
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
  expect([
    ...getContestIdsForPrecinct(electionDefinition, 'precinct-c1-w1-1'),
  ]).toEqual([
    'county-leader-mammal',
    'congressional-1-mammal',
    'water-1-fishing',
    'county-leader-fish',
    'congressional-1-fish',
  ]);
  expect([
    ...getContestIdsForPrecinct(electionDefinition, 'precinct-c1-w2'),
  ]).toEqual([
    'county-leader-mammal',
    'congressional-1-mammal',
    'water-2-fishing',
    'county-leader-fish',
    'congressional-1-fish',
  ]);
});

test('getContestsForPrecinctSelection', () => {
  const { electionDefinition } = electionPrimaryPrecinctSplitsFixtures;
  expect(
    getContestsForPrecinctSelection(electionDefinition, {
      kind: 'SinglePrecinct',
      precinctId: 'precinct-c1-w2',
    }).map((c) => c.id)
  ).toEqual([
    'county-leader-mammal',
    'congressional-1-mammal',
    'water-2-fishing',
    'county-leader-fish',
    'congressional-1-fish',
  ]);

  expect(
    getContestsForPrecinctSelection(electionDefinition, {
      kind: 'AllPrecincts',
    }).map((c) => c.id)
  ).toEqual([
    'county-leader-mammal',
    'county-leader-fish',
    'congressional-1-mammal',
    'congressional-1-fish',
    'congressional-2-mammal',
    'congressional-2-fish',
    'water-1-fishing',
    'water-2-fishing',
  ]);
});
