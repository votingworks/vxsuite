import { expect, test } from 'vitest';
import { Tabulation } from '@votingworks/types';
import {
  CsvMetadataStructure,
  determineCsvMetadataStructure,
} from './csv_shared.js';

const ALL: CsvMetadataStructure = {
  precinct: 'all',
  ballotStyle: 'all',
  party: 'all',
  votingMethod: 'all',
  scanner: 'all',
  batch: 'all',
};

test('determineCsvMetadataStructure - no filter or group by', () => {
  expect(determineCsvMetadataStructure({ filter: {}, groupBy: {} })).toEqual(
    ALL
  );
});

test('determineCsvMetadataStructure - single and multiple filter values', () => {
  expect(
    determineCsvMetadataStructure({
      filter: {
        precinctIds: ['precinct-1'],
        ballotStyleGroupIds: ['1M', '2F'],
        partyIds: ['0'],
        votingMethods: ['absentee', 'precinct'],
        scannerIds: ['scanner-1'],
        batchIds: ['batch-1', 'batch-2'],
      },
      groupBy: {},
    })
  ).toEqual({
    precinct: 'single',
    ballotStyle: 'multi',
    party: 'single',
    votingMethod: 'multi',
    scanner: 'single',
    batch: 'multi',
  });
});

test('determineCsvMetadataStructure - grouping forces single', () => {
  expect(
    determineCsvMetadataStructure({
      filter: { precinctIds: ['precinct-1', 'precinct-2'] },
      groupBy: { groupByPrecinct: true },
    })
  ).toMatchObject({ precinct: 'single' });
});

// A filter dimension reduced to no values selects no ballots. It must not be
// treated as "single", since there is no lone value to report, and must not be
// treated as "all", which would mean the dimension is unfiltered.
test('determineCsvMetadataStructure - empty filter values are not single', () => {
  const dimensions: Array<
    [keyof Tabulation.Filter, keyof CsvMetadataStructure]
  > = [
    ['precinctIds', 'precinct'],
    ['ballotStyleGroupIds', 'ballotStyle'],
    ['partyIds', 'party'],
    ['votingMethods', 'votingMethod'],
    ['scannerIds', 'scanner'],
    ['batchIds', 'batch'],
  ];

  for (const [filterKey, structureKey] of dimensions) {
    const structure = determineCsvMetadataStructure({
      filter: { [filterKey]: [] },
      groupBy: {},
    });
    expect(structure).toEqual({ ...ALL, [structureKey]: 'multi' });
  }
});
