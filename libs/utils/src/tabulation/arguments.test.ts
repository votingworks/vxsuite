import { expect, test } from 'vitest';
import { BallotStyleGroupId, Tabulation } from '@votingworks/types';
import {
  combineGroupSpecifierAndFilter,
  groupBySupportsZeroSplits,
  isFilterEmpty,
  isGroupByEmpty,
} from './arguments';

test('combineGroupSpecifierAndFilter', () => {
  const testCases: Array<
    [Tabulation.GroupSpecifier, Tabulation.Filter, Tabulation.Filter]
  > = [
    [{}, {}, {}],
    [
      { precinctId: 'precinct-1' },
      { ballotStyleGroupIds: ['1M', '2F'] as BallotStyleGroupId[] },
      {
        precinctIds: ['precinct-1'],
        ballotStyleGroupIds: ['1M', '2F'] as BallotStyleGroupId[],
      },
    ],
    [
      { votingMethod: 'absentee' },
      { precinctIds: ['precinct-1', 'precinct-2'] },
      {
        votingMethods: ['absentee'],
        precinctIds: ['precinct-1', 'precinct-2'],
      },
    ],
    [
      { batchId: 'batch-1' },
      { votingMethods: ['absentee', 'precinct'] },
      { batchIds: ['batch-1'], votingMethods: ['absentee', 'precinct'] },
    ],
    [
      { scannerId: 'scanner-1' },
      { batchIds: ['batch-1', 'batch-2'] },
      { scannerIds: ['scanner-1'], batchIds: ['batch-1', 'batch-2'] },
    ],
    [
      { partyId: 'party-1' },
      { scannerIds: ['scanner-1', 'scanner-2'] },
      { partyIds: ['party-1'], scannerIds: ['scanner-1', 'scanner-2'] },
    ],
    [
      { ballotStyleGroupId: '1M' },
      { partyIds: ['party-1', 'party-2'] },
      {
        ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[],
        partyIds: ['party-1', 'party-2'],
      },
    ],
  ];

  for (const testCase of testCases) {
    const [group, filter, expected] = testCase;
    expect(combineGroupSpecifierAndFilter(group, filter)).toEqual(expected);
  }
});

test('combineGroupSpecifierAndFilter does not remove extension filters', () => {
  type ExtendedFilter = Tabulation.Filter & { extra: string[] };

  const filter: ExtendedFilter = {
    extra: ['extra'],
    precinctIds: ['precinct-1', 'precinct-2'],
  };

  expect(
    combineGroupSpecifierAndFilter({ precinctId: 'precinct-1' }, filter)
  ).toEqual({
    extra: ['extra'],
    precinctIds: ['precinct-1'],
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

test('isFilterEmpty', () => {
  expect(isFilterEmpty({})).toEqual(true);
  expect(isFilterEmpty({ precinctIds: ['id'] })).toEqual(false);
  expect(isFilterEmpty({ batchIds: ['id'] })).toEqual(false);
  expect(isFilterEmpty({ scannerIds: ['id'] })).toEqual(false);
  expect(isFilterEmpty({ partyIds: ['id'] })).toEqual(false);
  expect(isFilterEmpty({ votingMethods: ['absentee'] })).toEqual(false);
  expect(
    isFilterEmpty({
      ballotStyleGroupIds: ['id'] as BallotStyleGroupId[],
    })
  ).toEqual(false);
});
