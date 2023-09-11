import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS, Tabulation } from '@votingworks/types';
import { GROUP_KEY_ROOT, groupMapToGroupList } from '@votingworks/utils';
import { typedAs } from '@votingworks/basics';
import { Store } from '../store';
import {
  MockCastVoteRecordFile,
  addMockCvrFileToStore,
} from '../../test/mock_cvr_file';
import {
  tabulateFullCardCounts,
  tabulateScannedCardCounts,
} from './card_counts';

test('tabulateScannedCardCounts - grouping', () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 6,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-1-2',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 17,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-2-1',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 9,
    },
    {
      ballotStyleId: '2F',
      batchId: 'batch-2-2',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 12,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-3-1',
      scannerId: 'scanner-3',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 34,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  const testCases: Array<{
    groupBy?: Tabulation.GroupBy;
    expected: Array<[groupKey: Tabulation.GroupKey, tally: number]>;
  }> = [
    // no filter case
    {
      expected: [['root', 83]],
    },
    // each group case
    {
      groupBy: { groupByBallotStyle: true },
      expected: [
        ['root&ballotStyleId=1M', 45],
        ['root&ballotStyleId=2F', 38],
      ],
    },
    {
      groupBy: { groupByParty: true },
      expected: [
        ['root&partyId=0', 45],
        ['root&partyId=1', 38],
      ],
    },
    {
      groupBy: { groupByBatch: true },
      expected: [
        ['root&batchId=batch-1-1', 11],
        ['root&batchId=batch-1-2', 17],
        ['root&batchId=batch-2-1', 9],
        ['root&batchId=batch-2-2', 12],
        ['root&batchId=batch-3-1', 34],
      ],
    },
    {
      groupBy: { groupByScanner: true },
      expected: [
        ['root&scannerId=scanner-1', 28],
        ['root&scannerId=scanner-2', 21],
        ['root&scannerId=scanner-3', 34],
      ],
    },
    {
      groupBy: { groupByPrecinct: true },
      expected: [
        ['root&precinctId=precinct-1', 28],
        ['root&precinctId=precinct-2', 55],
      ],
    },
    {
      groupBy: { groupByVotingMethod: true },
      expected: [
        ['root&votingMethod=precinct', 68],
        ['root&votingMethod=absentee', 15],
      ],
    },
  ];

  for (const { groupBy, expected } of testCases) {
    const groupedCardCounts = tabulateScannedCardCounts({
      electionId,
      store,
      groupBy,
    });

    for (const [groupKey, tally] of expected) {
      expect(groupedCardCounts[groupKey]).toEqual({
        bmd: tally,
        hmpb: [],
      });
    }

    expect(Object.values(groupedCardCounts)).toHaveLength(expected.length);
  }
});

test('tabulateScannedCardCounts - merging card tallies', () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'hmpb', sheetNumber: 2 },
      multiplier: 7,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'hmpb', sheetNumber: 1 },
      multiplier: 6,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  expect(
    tabulateScannedCardCounts({
      electionId,
      store,
    })[GROUP_KEY_ROOT]
  ).toEqual({
    bmd: 5,
    hmpb: [6, 7],
  });

  expect(
    tabulateScannedCardCounts({
      electionId,
      store,
      groupBy: { groupByScanner: true },
    })['root&scannerId=scanner-1']
  ).toEqual({
    bmd: 5,
    hmpb: [6, 7],
  });
});

test('tabulateFullCardCounts - blankBallots', () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleId: '1M',
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: {}, // blank
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleId: '1M',
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] }, // not blank
      card: { type: 'bmd' },
      multiplier: 6,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  const allBallotCounts = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      store,
    })
  );

  expect(allBallotCounts).toEqual([
    typedAs<Tabulation.CardCounts>({
      bmd: 11,
      hmpb: [],
      manual: 0,
    }),
  ]);

  const blankBallotCounts = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      store,
      blankBallotsOnly: true,
    })
  );

  expect(blankBallotCounts).toEqual([
    typedAs<Tabulation.CardCounts>({
      bmd: 5,
      hmpb: [],
    }),
  ]);
});
