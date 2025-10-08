import { describe, expect, test } from 'vitest';
import {
  electionPrimaryPrecinctSplitsFixtures,
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
  readElectionTwoPartyPrimary,
} from '@votingworks/fixtures';
import { find } from '@votingworks/basics';
import {
  doesContestAppearOnPartyBallot,
  getContestIdsForBallotStyle,
  getContestIdsForPrecinct,
  getContestsForPrecinct,
  getContestsForPrecinctAndElection,
  groupContestsByParty,
} from './contest_filtering';
import { singlePrecinctSelectionFor } from '../precinct_selection';

describe('doesContestAppearOnPartyBallot', () => {
  test('in a primary election', () => {
    const { contests } = readElectionTwoPartyPrimary();

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
    const { contests } = electionFamousNames2021Fixtures.readElection();
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
  const electionDefinition = readElectionTwoPartyPrimaryDefinition();
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
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
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

test('getContestsForPrecinct', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  expect(
    getContestsForPrecinct(
      electionDefinition,
      singlePrecinctSelectionFor('precinct-c1-w2')
    ).map((c) => c.id)
  ).toEqual([
    'county-leader-mammal',
    'congressional-1-mammal',
    'water-2-fishing',
    'county-leader-fish',
    'congressional-1-fish',
  ]);
});

test('getContestsForPrecinctAndElection', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  expect(
    getContestsForPrecinctAndElection(
      electionDefinition.election,
      singlePrecinctSelectionFor('precinct-c1-w2')
    ).map((c) => c.id)
  ).toEqual([
    'county-leader-mammal',
    'congressional-1-mammal',
    'water-2-fishing',
    'county-leader-fish',
    'congressional-1-fish',
  ]);
});

describe('groupContestsByParty', () => {
  test('in a primary election', () => {
    const election = readElectionTwoPartyPrimary();
    const result = groupContestsByParty(election, election.contests);

    expect(result).toHaveLength(3); // Two parties + non-partisan

    // Mammal party contests
    const mammalGroup = find(result, (group) => group.partyId === '0');
    expect(mammalGroup).toBeDefined();
    expect(mammalGroup.contests.map((c) => c.id)).toEqual([
      'best-animal-mammal',
      'zoo-council-mammal',
    ]);
    expect(
      mammalGroup.contests.every(
        (c) => c.type === 'candidate' && c.partyId === '0'
      )
    ).toEqual(true);

    // Fish party contests
    const fishGroup = find(result, (group) => group.partyId === '1');
    expect(fishGroup).toBeDefined();
    expect(fishGroup.contests.map((c) => c.id)).toEqual([
      'best-animal-fish',
      'aquarium-council-fish',
    ]);
    expect(
      fishGroup.contests.every(
        (c) => c.type === 'candidate' && c.partyId === '1'
      )
    ).toEqual(true);

    // Non-partisan contests (ballot measures and contests without party)
    const nonPartisanGroup = find(
      result,
      (group) => group.partyId === undefined
    );
    expect(nonPartisanGroup).toBeDefined();
    expect(nonPartisanGroup.contests.map((c) => c.id)).toEqual([
      'new-zoo-either',
      'new-zoo-pick',
      'fishing',
    ]);
    expect(
      nonPartisanGroup.contests.every((c) => c.type === 'yesno' || !c.partyId)
    ).toEqual(true);
  });

  test('in a general election with no partisan contests', () => {
    const election = electionFamousNames2021Fixtures.readElection();
    const result = groupContestsByParty(election, election.contests);

    // Should only have non-partisan group since general elections don't have party-specific contests
    expect(result).toHaveLength(1);

    const nonPartisanGroup = result[0];
    expect(nonPartisanGroup).toBeDefined();
    expect(nonPartisanGroup!.partyId).toBeUndefined();
    expect(nonPartisanGroup!.contests).toEqual(election.contests);
    expect(
      nonPartisanGroup!.contests.every((c) => c.type === 'yesno' || !c.partyId)
    ).toEqual(true);
  });

  test('with mixed contest types and empty contest list', () => {
    const election = readElectionTwoPartyPrimary();
    const result = groupContestsByParty(election, []);

    // Should still return groups for each party, but with empty contest arrays
    expect(result).toHaveLength(3);

    const mammalGroup = find(result, (group) => group.partyId === '0');
    expect(mammalGroup).toBeDefined();
    expect(mammalGroup.contests).toEqual([]);

    const fishGroup = find(result, (group) => group.partyId === '1');
    expect(fishGroup).toBeDefined();
    expect(fishGroup.contests).toEqual([]);

    const nonPartisanGroup = find(
      result,
      (group) => group.partyId === undefined
    );
    expect(nonPartisanGroup).toBeDefined();
    expect(nonPartisanGroup.contests).toEqual([]);
  });

  test('with subset of contests from primary election', () => {
    const election = readElectionTwoPartyPrimary();
    const subset = [
      find(election.contests, (c) => c.id === 'best-animal-mammal'),
      find(election.contests, (c) => c.id === 'fishing'),
    ].filter((c): c is NonNullable<typeof c> => c !== undefined);

    const result = groupContestsByParty(election, subset);

    expect(result).toHaveLength(3);

    // Should only include mammal contest in mammal party
    const mammalGroup = find(result, (group) => group.partyId === '0');
    expect(mammalGroup).toBeDefined();
    expect(mammalGroup.contests.map((c) => c.id)).toEqual([
      'best-animal-mammal',
    ]);

    // Should have no fish party contests
    const fishGroup = find(result, (group) => group.partyId === '1');
    expect(fishGroup).toBeDefined();
    expect(fishGroup.contests).toEqual([]);

    // Should include ballot measure in non-partisan group
    const nonPartisanGroup = find(
      result,
      (group) => group.partyId === undefined
    );
    expect(nonPartisanGroup).toBeDefined();
    expect(nonPartisanGroup.contests.map((c) => c.id)).toEqual(['fishing']);
  });
});
