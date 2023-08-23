import { Tabulation } from '@votingworks/types';
import {
  convertGroupSpecifierToFilter,
  groupBySupportsZeroSplits,
  isGroupByEmpty,
  mergeFilters,
} from './arguments';

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

test('isGroupByEmpty', () => {
  expect(isGroupByEmpty({})).toEqual(true);
  expect(isGroupByEmpty({ groupByBallotStyle: true })).toEqual(false);
  expect(isGroupByEmpty({ groupByBatch: true })).toEqual(false);
  expect(isGroupByEmpty({ groupByPrecinct: true })).toEqual(false);
  expect(isGroupByEmpty({ groupByParty: true })).toEqual(false);
  expect(isGroupByEmpty({ groupByScanner: true })).toEqual(false);
  expect(isGroupByEmpty({ groupByVotingMethod: true })).toEqual(false);
});
