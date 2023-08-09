import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import {
  getContestIdsForBallotStyle,
  getContestIdsForFilter,
  getContestIdsForParty,
  getContestIdsForPrecinct,
  getContestIdsForSplit,
  intersectSets,
  unionSets,
} from './contest_filtering';
import { complexBallotStyleElectionDefinition } from '../../test/fixtures';

function expectArrayContentsEqual<T>(a: T[], b: T[]) {
  expect(a).toEqual(expect.arrayContaining(b));
  expect(a).toHaveLength(b.length);
}

test('unionSets', () => {
  const x = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const y = new Set([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  const z = new Set([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);

  expect([...unionSets([x, y, z])]).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18,
  ]);
});

test('intersectSets', () => {
  const x = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const y = new Set([5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  const z = new Set([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);

  expect([...intersectSets([x, y, z])]).toEqual([6, 8]);

  expect([...intersectSets([])]).toEqual([]);
});

test('getContestIdsForBallotStyle', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
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

test('getContestIdsForParty', () => {
  const electionDefinition = electionMinimalExhaustiveSampleDefinition;
  expect([...getContestIdsForParty(electionDefinition, '0')]).toEqual([
    'best-animal-mammal',
    'zoo-council-mammal',
    'new-zoo-either',
    'new-zoo-pick',
    'fishing',
  ]);
  expect([...getContestIdsForParty(electionDefinition, '1')]).toEqual([
    'best-animal-fish',
    'aquarium-council-fish',
    'new-zoo-either',
    'new-zoo-pick',
    'fishing',
  ]);
});

test('getContestIdsForPrecinct', () => {
  const electionDefinition = complexBallotStyleElectionDefinition;
  expect([...getContestIdsForPrecinct(electionDefinition, 'c1-w1-2')]).toEqual([
    'congressional-1-mammal',
    'town-mammal',
    'water-1-mammal',
    'congressional-1-fish',
    'town-fish',
    'water-1-fish',
  ]);
  expect([...getContestIdsForPrecinct(electionDefinition, 'c2-w1-1')]).toEqual([
    'congressional-2-mammal',
    'town-mammal',
    'water-1-mammal',
    'congressional-2-fish',
    'town-fish',
    'water-1-fish',
  ]);
});

describe('getContestIdsForFilter', () => {
  const electionDefinition = complexBallotStyleElectionDefinition;
  const { election } = electionDefinition;

  test('no filter', () => {
    expectArrayContentsEqual(
      [...getContestIdsForFilter(electionDefinition)],
      election.contests.map((c) => c.id)
    );
  });

  test('precinct filter', () => {
    expectArrayContentsEqual(
      [
        ...getContestIdsForFilter(electionDefinition, {
          precinctIds: ['c1-w1-1', 'c1-w2-1'],
        }),
      ],
      [
        'congressional-1-mammal',
        'congressional-1-fish',
        'town-mammal',
        'town-fish',
        'water-1-mammal',
        'water-1-fish',
        'water-2-mammal',
        'water-2-fish',
      ]
    );
  });

  test('party filter', () => {
    expectArrayContentsEqual(
      [
        ...getContestIdsForFilter(electionDefinition, {
          partyIds: ['0'],
        }),
      ],
      [
        'congressional-1-mammal',
        'congressional-2-mammal',
        'town-mammal',
        'water-1-mammal',
        'water-2-mammal',
      ]
    );
  });

  test('ballot style filter', () => {
    expectArrayContentsEqual(
      [
        ...getContestIdsForFilter(electionDefinition, {
          ballotStyleIds: ['c1-w1-mammal', 'c1-w2-fish'],
        }),
      ],
      [
        'congressional-1-mammal',
        'congressional-1-fish',
        'town-mammal',
        'town-fish',
        'water-1-mammal',
        'water-2-fish',
      ]
    );
  });

  test('impossible party + ballot style filter', () => {
    expect([
      ...getContestIdsForFilter(electionDefinition, {
        partyIds: ['0'],
        ballotStyleIds: ['c1-w2-fish'],
      }),
    ]).toEqual([]);
  });

  test('impossible precinct + ballot style filter', () => {
    expect([
      ...getContestIdsForFilter(electionDefinition, {
        precinctIds: ['c1-w1-2'],
        ballotStyleIds: ['c2-w2-fish'],
      }),
    ]).toEqual([]);
  });

  test('precinct * party', () => {
    expect([
      ...getContestIdsForFilter(electionDefinition, {
        precinctIds: ['c1-w1-2'],
        partyIds: ['0'],
      }),
    ]).toEqual(['congressional-1-mammal', 'town-mammal', 'water-1-mammal']);
  });

  test('precinct * ballot style', () => {
    expectArrayContentsEqual(
      [
        ...getContestIdsForFilter(electionDefinition, {
          precinctIds: ['c1-w1-1', 'c1-w1-2', 'c1-w2-1'],
          ballotStyleIds: ['c1-w2-mammal', 'c2-w2-mammal'],
        }),
      ],
      ['congressional-1-mammal', 'town-mammal', 'water-2-mammal']
    );
  });
});

describe('getContestIdsForSplit', () => {
  const electionDefinition = complexBallotStyleElectionDefinition;
  test('ballot style', () => {
    expectArrayContentsEqual(
      [
        ...getContestIdsForSplit(electionDefinition, {
          ballotStyleId: 'c1-w1-mammal',
        }),
      ],
      ['congressional-1-mammal', 'town-mammal', 'water-1-mammal']
    );
  });

  test('party', () => {
    expectArrayContentsEqual(
      [
        ...getContestIdsForSplit(electionDefinition, {
          partyId: '0',
        }),
      ],
      [
        'congressional-1-mammal',
        'congressional-2-mammal',
        'town-mammal',
        'water-1-mammal',
        'water-2-mammal',
      ]
    );
  });

  test('precinct', () => {
    expectArrayContentsEqual(
      [
        ...getContestIdsForSplit(electionDefinition, {
          precinctId: 'c1-w1-1',
        }),
      ],
      [
        'congressional-1-mammal',
        'town-mammal',
        'water-1-mammal',
        'congressional-1-fish',
        'town-fish',
        'water-1-fish',
      ]
    );
  });

  test('precinct * party', () => {
    expectArrayContentsEqual(
      [
        ...getContestIdsForSplit(electionDefinition, {
          partyId: '0',
          precinctId: 'c1-w1-1',
        }),
      ],
      ['congressional-1-mammal', 'town-mammal', 'water-1-mammal']
    );
  });

  test('invalid combo', () => {
    expectArrayContentsEqual(
      [
        ...getContestIdsForSplit(electionDefinition, {
          ballotStyleId: 'c1-w2-mammal',
          precinctId: 'c1-w1-1',
        }),
      ],
      []
    );
  });
});
