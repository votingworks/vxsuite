import { Buffer } from 'node:buffer';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import { Admin, DEFAULT_SYSTEM_SETTINGS, Tabulation } from '@votingworks/types';
import {
  GROUP_KEY_ROOT,
  buildManualResultsFixture,
  groupMapToGroupList,
} from '@votingworks/utils';
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
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
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
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
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

test('tabulateFullCardCounts - manual results', () => {
  const store = Store.memoryStore();
  const { electionDefinition, election } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // add mock scanned records
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleId: '1M',
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 30,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  // add manual results
  store.setManualResults({
    electionId,
    precinctId: 'precinct-1',
    ballotStyleId: '1M',
    votingMethod: 'absentee',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 20,
      contestResultsSummaries: {
        fishing: {
          type: 'yesno',
          ballots: 20,
          overvotes: 0,
          undervotes: 0,
          yesTally: 20,
          noTally: 0,
        },
      },
    }),
  });

  // Case 1: manual ballot counts should be merged into results if compatible with parameters
  const precinctCardCounts = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      store,
      groupBy: {
        groupByPrecinct: true,
      },
    })
  );
  expect(precinctCardCounts).toEqual([
    {
      bmd: 30,
      hmpb: [],
      manual: 20,
      precinctId: 'precinct-1',
    },
    {
      bmd: 0,
      hmpb: [],
      manual: 0,
      precinctId: 'precinct-2',
    },
  ]);

  const votingMethodCardCounts = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      store,
      groupBy: {
        groupByVotingMethod: true,
      },
    })
  );
  expect(votingMethodCardCounts).toEqual([
    {
      bmd: 30,
      hmpb: [],
      manual: 0,
      votingMethod: 'precinct',
    },
    {
      bmd: 0,
      hmpb: [],
      manual: 20,
      votingMethod: 'absentee',
    },
  ]);

  // Case 2: manual ballot counts should excluded separately if incompatible with filter
  const scannerCardCounts = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      store,
      filter: { scannerIds: ['scanner-1'] },
    })
  );
  expect(scannerCardCounts).toEqual([
    {
      bmd: 30,
      hmpb: [],
    },
  ]);

  // Case 3: manual ballot counts should included separately if incompatible with grouping
  const byBatchCardCounts = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      store,
      groupBy: {
        groupByBatch: true,
      },
    })
  );
  expect(byBatchCardCounts).toEqual([
    {
      batchId: 'batch-1',
      bmd: 30,
      hmpb: [],
      manual: 0,
    },
    {
      batchId: Tabulation.MANUAL_BATCH_ID,
      bmd: 0,
      hmpb: [],
      manual: 20,
    },
  ]);
});

test('tabulateFullCardCounts - blankBallots', () => {
  const store = Store.memoryStore();
  const { electionDefinition } = electionTwoPartyPrimaryFixtures;
  const { electionData } = electionDefinition;
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const cvrMetadata = {
    ballotStyleId: '1M',
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
    card: { type: 'bmd' },
  } as const;

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ...cvrMetadata,
      votes: { 'zoo-council-mammal': [] }, // blank, undervoted
      multiplier: 1,
    },
    {
      ...cvrMetadata,
      votes: { 'zoo-council-mammal': ['zebra'] }, // undervoted
      multiplier: 2,
    },
    {
      ...cvrMetadata,
      votes: { 'zoo-council-mammal': ['zebra', 'lion', 'kangaroo'] }, // normal
      multiplier: 3,
    },
    {
      ...cvrMetadata,
      votes: {
        'zoo-council-mammal': ['zebra', 'lion', 'kangaroo', 'elephant'],
      }, // overvoted
      multiplier: 4,
    },
    {
      ...cvrMetadata,
      votes: { 'zoo-council-mammal': ['zebra', 'lion', 'write-in-0'] }, // write-in
      multiplier: 5,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  const testCases: Array<{
    adjudicationFlags?: Admin.ReportingFilter['adjudicationFlags'];
    expected: number;
  }> = [
    {
      adjudicationFlags: [],
      expected: 15,
    },
    {
      adjudicationFlags: ['isBlank'],
      expected: 1,
    },
    {
      adjudicationFlags: ['hasUndervote'],
      expected: 3,
    },
    {
      adjudicationFlags: ['hasOvervote'],
      expected: 4,
    },
    {
      adjudicationFlags: ['hasWriteIn'],
      expected: 5,
    },
  ];

  for (const testCase of testCases) {
    const [cardCounts] = groupMapToGroupList(
      tabulateFullCardCounts({
        electionId,
        store,
        filter: {
          adjudicationFlags: testCase.adjudicationFlags,
        },
      })
    );

    expect(cardCounts?.bmd).toEqual(testCase.expected);
  }
});
