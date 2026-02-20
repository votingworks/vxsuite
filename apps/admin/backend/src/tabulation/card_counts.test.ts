import { expect, test, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import {
  Admin,
  BallotStyleGroupId,
  DEFAULT_SYSTEM_SETTINGS,
  Tabulation,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  GROUP_KEY_ROOT,
  buildManualResultsFixture,
  getFeatureFlagMock,
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

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

featureFlagMock.enableFeatureFlag(BooleanEnvironmentVariableName.EARLY_VOTING);

test('tabulateScannedCardCounts - grouping', () => {
  const store = Store.memoryStore();
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
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
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 6,
    },
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-1-2',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 17,
    },
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-2-1',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 9,
    },
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-2-2',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 12,
    },
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
        ['root&ballotStyleGroupId=1M', 45],
        ['root&ballotStyleGroupId=2F', 38],
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
        ['root&votingMethod=early_voting', 0],
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
        bmd: tally > 0 ? [tally] : [],
        hmpb: [],
      });
    }

    expect(Object.values(groupedCardCounts)).toHaveLength(expected.length);
  }
});

test('tabulateScannedCardCounts - groupByBatchDate', () => {
  const store = Store.memoryStore();
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  store.addScannerBatch({
    electionId,
    batchId: 'batch-day1-a',
    scannerId: 'scanner-1',
    label: 'Batch batch-day1-a',
    startedAt: '2024-11-05T08:00:00.000Z',
  });
  store.addScannerBatch({
    electionId,
    batchId: 'batch-day1-b',
    scannerId: 'scanner-1',
    label: 'Batch batch-day1-b',
    startedAt: '2024-11-05T14:30:00.000Z',
  });
  store.addScannerBatch({
    electionId,
    batchId: 'batch-day2',
    scannerId: 'scanner-2',
    label: 'Batch batch-day2',
    startedAt: '2024-11-06T09:00:00.000Z',
  });

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-day1-a',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 10,
    },
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-day1-b',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 15,
    },
    {
      ballotStyleGroupId: '2F' as BallotStyleGroupId,
      batchId: 'batch-day2',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 7,
    },
  ];
  addMockCvrFileToStore({ electionId, mockCastVoteRecordFile, store });

  // Two batches on 2024-11-05 should be grouped together
  const groupedCardCounts = tabulateScannedCardCounts({
    electionId,
    store,
    groupBy: { groupByBatchDate: true },
  });

  expect(groupedCardCounts['root&batchDate=2024-11-05']).toEqual({
    bmd: [25],
    hmpb: [],
  });
  expect(groupedCardCounts['root&batchDate=2024-11-06']).toEqual({
    bmd: [7],
    hmpb: [],
  });
  expect(Object.values(groupedCardCounts)).toHaveLength(2);
});

test('tabulateFullCardCounts - groupByBatchDate with manual results', () => {
  const store = Store.memoryStore();
  const { election, electionData } =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  store.addScannerBatch({
    electionId,
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    label: 'Batch batch-1',
    startedAt: '2024-11-05T08:00:00.000Z',
  });

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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

  store.setManualResults({
    electionId,
    precinctId: 'precinct-1',
    ballotStyleGroupId: '1M' as BallotStyleGroupId,
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

  const byBatchDateCardCounts = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      store,
      groupBy: { groupByBatchDate: true },
    })
  );
  expect(byBatchDateCardCounts).toEqual([
    {
      batchDate: '2024-11-05',
      bmd: [30],
      hmpb: [],
      manual: 0,
    },
    {
      batchDate: Tabulation.MANUAL_BATCH_DATE,
      bmd: [],
      hmpb: [],
      manual: 20,
    },
  ]);
});

test('tabulateScannedCardCounts - merging card tallies', () => {
  const store = Store.memoryStore();
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
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
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'hmpb', sheetNumber: 2 },
      multiplier: 7,
    },
    {
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
    bmd: [5],
    hmpb: [6, 7],
  });

  expect(
    tabulateScannedCardCounts({
      electionId,
      store,
      groupBy: { groupByScanner: true },
    })['root&scannerId=scanner-1']
  ).toEqual({
    bmd: [5],
    hmpb: [6, 7],
  });
});

test('tabulateFullCardCounts - manual results', () => {
  const store = Store.memoryStore();
  const { election, electionData } =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
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
      ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
    ballotStyleGroupId: '1M' as BallotStyleGroupId,
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
      bmd: [30],
      hmpb: [],
      manual: 20,
      precinctId: 'precinct-1',
    },
    {
      bmd: [],
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
      bmd: [],
      hmpb: [],
      manual: 0,
      votingMethod: 'early_voting',
    },
    {
      bmd: [30],
      hmpb: [],
      manual: 0,
      votingMethod: 'precinct',
    },
    {
      bmd: [],
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
      bmd: [30],
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
      bmd: [30],
      hmpb: [],
      manual: 0,
    },
    {
      batchId: Tabulation.MANUAL_BATCH_ID,
      bmd: [],
      hmpb: [],
      manual: 20,
    },
  ]);
});

test('tabulateFullCardCounts - blankBallots', () => {
  const store = Store.memoryStore();
  const electionData = electionTwoPartyPrimaryFixtures.electionJson.asText();
  const electionId = store.addElection({
    electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: Buffer.of(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const cvrMetadata = {
    ballotStyleGroupId: '1M' as BallotStyleGroupId,
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

    expect(cardCounts?.bmd).toEqual([testCase.expected]);
  }
});
