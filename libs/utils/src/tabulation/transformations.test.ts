import { Tabulation } from '@votingworks/types';
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
      'root&ballotStyleId=1M&batchId=batch-1': {
        ballotCount: 1,
      },
      'root&ballotStyleId=1M&batchId=batch-2': {
        ballotCount: 2,
      },
      'root&ballotStyleId=2F&batchId=batch-1': {
        ballotCount: 3,
      },
      'root&ballotStyleId=2F&batchId=batch-2': {
        ballotCount: 4,
      },
    })
  ).toEqual([
    {
      ballotCount: 1,
      ballotStyleId: '1M',
      batchId: 'batch-1',
    },
    {
      ballotCount: 2,
      ballotStyleId: '1M',
      batchId: 'batch-2',
    },
    {
      ballotCount: 3,
      ballotStyleId: '2F',
      batchId: 'batch-1',
    },
    {
      ballotCount: 4,
      ballotStyleId: '2F',
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
    (partyBallotCounts) => {
      return {
        ballotCount: partyBallotCounts.reduce(
          (sum, { ballotCount }) => sum + ballotCount,
          0
        ),
      };
    }
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
