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
