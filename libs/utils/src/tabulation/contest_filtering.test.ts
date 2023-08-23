import {
  electionComplexGeoSample,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { Tabulation } from '@votingworks/types';
import {
  convertGroupSpecifierToFilter,
  getContestIdsForBallotStyle,
  getContestIdsForFilter,
  getContestIdsForParty,
  getContestIdsForPrecinct,
  getContestsForPrecinct,
  groupBySupportsZeroSplits,
  intersectSets,
  mergeFilters,
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

test('groupBySupportsZeroSplits', () => {
  expect(groupBySupportsZeroSplits({})).toEqual(true);
  expect(groupBySupportsZeroSplits({ groupByPrecinct: true })).toEqual(true);
  expect(groupBySupportsZeroSplits({ groupByBallotStyle: true })).toEqual(true);
  expect(groupBySupportsZeroSplits({ groupByParty: true })).toEqual(true);
  expect(groupBySupportsZeroSplits({ groupByVotingMethod: true })).toEqual(
    true
  );
  expect(groupBySupportsZeroSplits({ groupByBatch: true })).toEqual(false);
  expect(groupBySupportsZeroSplits({ groupByScanner: true })).toEqual(false);
  expect(
    groupBySupportsZeroSplits({ groupByBatch: true, groupByBallotStyle: true })
  ).toEqual(false);
});

test('convertGroupSpecifierToFilter', () => {
  expect(
    convertGroupSpecifierToFilter({
      partyId: 'id',
      ballotStyleId: 'id',
      precinctId: 'id',
      votingMethod: 'absentee',
      batchId: 'id',
      scannerId: 'id',
    })
  ).toEqual({
    partyIds: ['id'],
    ballotStyleIds: ['id'],
    precinctIds: ['id'],
    votingMethods: ['absentee'],
    batchIds: ['id'],
    scannerIds: ['id'],
  });

  expect(convertGroupSpecifierToFilter({})).toEqual({});
});

test('mergeFilters', () => {
  expect(mergeFilters({}, {})).toEqual({});

  const filter1: Tabulation.Filter = {
    precinctIds: ['precinct-1'],
  };
  const filter2: Tabulation.Filter = {
    votingMethods: ['absentee'],
  };
  expect(mergeFilters(filter1, {})).toEqual(filter1);
  expect(mergeFilters({}, filter1)).toEqual(filter1);

  expect(mergeFilters(filter1, filter2)).toEqual({
    precinctIds: ['precinct-1'],
    votingMethods: ['absentee'],
  });
});

test('getContestsForPrecinct', () => {
  const { electionDefinition } = electionComplexGeoSample;
  expect(
    getContestsForPrecinct(electionDefinition, 'precinct-c1-w2').map(
      (c) => c.id
    )
  ).toEqual([
    'county-leader-mammal',
    'congressional-1-mammal',
    'water-2-fishing',
    'county-leader-fish',
    'congressional-1-fish',
  ]);
});
