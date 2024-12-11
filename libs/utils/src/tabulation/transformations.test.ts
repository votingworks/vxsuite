import { expect, test } from 'vitest';
import { BallotStyleGroupId, Tabulation } from '@votingworks/types';
import { iter } from '@votingworks/basics';
import {
  coalesceGroupsAcrossParty,
  groupMapToGroupList,
  mergeTabulationGroupMaps,
} from './transformations';

interface BallotCount {
  ballotCount: number;
}

test('mergeTabulationGroups', () => {
  const revenues: Tabulation.GroupMap<{ count: number }> = {
    a: {
      count: 5,
    },
    b: {
      count: 10,
    },
    c: {
      count: 15,
    },
    e: {
      count: 20,
    },
  };

  const expenses: Tabulation.GroupMap<{ count: number }> = {
    b: {
      count: 7,
    },
    c: {
      count: 14,
    },
    d: {
      count: 21,
    },
  };

  expect(
    mergeTabulationGroupMaps(
      revenues,
      expenses,
      (revenue, expense) => (revenue?.count ?? 0) - (expense?.count ?? 0)
    )
  ).toEqual({
    a: 5,
    b: 3,
    c: 1,
    d: -21,
    e: 20,
  });
});

test('groupMapToGroupList', () => {
  expect(
    groupMapToGroupList({
      'root&ballotStyleGroupId=1M&batchId=batch-1': {
        ballotCount: 1,
      },
      'root&ballotStyleGroupId=1M&batchId=batch-2': {
        ballotCount: 2,
      },
      'root&ballotStyleGroupId=2F&batchId=batch-1': {
        ballotCount: 3,
      },
      'root&ballotStyleGroupId=2F&batchId=batch-2': {
        ballotCount: 4,
      },
    })
  ).toEqual([
    {
      ballotCount: 1,
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1',
    },
    {
      ballotCount: 2,
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-2',
    },
    {
      ballotCount: 3,
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-1',
    },
    {
      ballotCount: 4,
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-2',
    },
  ]);
});

test('coalesceGroupsAcrossParty', () => {
  const ballotCounts: Tabulation.GroupList<BallotCount> = [
    { precinctId: 'A', partyId: '0', ballotCount: 1 },
    { precinctId: 'A', partyId: '1', ballotCount: 2 },
    { precinctId: 'B', partyId: '0', ballotCount: 3 },
    { precinctId: 'B', partyId: '1', ballotCount: 4 },
  ];

  const coalescedBallotCounts = coalesceGroupsAcrossParty(
    ballotCounts,
    { groupByPrecinct: true },
    (partyBallotCounts) => ({
      ballotCount: iter(partyBallotCounts)
        .map(({ ballotCount }) => ballotCount)
        .sum(),
    })
  );

  expect(coalescedBallotCounts).toEqual([
    {
      precinctId: 'A',
      ballotCount: 3,
    },
    {
      precinctId: 'B',
      ballotCount: 7,
    },
  ]);
});
