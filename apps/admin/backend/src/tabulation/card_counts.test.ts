import { expect, test } from 'vitest';
import {
  electionCombinedBallotPrimaryFixtures,
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import {
  Admin,
  BallotStyleGroupId,
  DEFAULT_SYSTEM_SETTINGS,
  SystemSettings,
  Tabulation,
} from '@votingworks/types';
import {
  buildManualResultsFixture,
  getGroupKey,
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

const systemSettings: SystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  enableEarlyVoting: true,
};
const systemSettingsData = JSON.stringify(systemSettings);

test('tabulateScannedCardCounts - grouping', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const { election, electionData } =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 6,
    },
    {
      ballotStyleGroupId: '2F',
      batchId: 'batch-1-2',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 17,
    },
    {
      ballotStyleGroupId: '2F',
      batchId: 'batch-2-1',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 9,
    },
    {
      ballotStyleGroupId: '2F',
      batchId: 'batch-2-2',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 12,
    },
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-3-1',
      scannerId: 'scanner-3',
      precinctId: 'precinct-2',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 34,
    },
  ];
  addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });

  const testCases: Array<{
    groupBy?: Tabulation.GroupBy;
    expected: Array<[groupKey: Tabulation.GroupKey, tally: number]>;
  }> = [
    // no filter case
    {
      expected: [['{}', 83]],
    },
    // each group case
    {
      groupBy: { groupByBallotStyle: true },
      expected: [
        ['{"ballotStyleGroupId":"1M"}', 45],
        ['{"ballotStyleGroupId":"2F"}', 38],
      ],
    },
    {
      groupBy: { groupByParty: true },
      expected: [
        ['{"partyId":"0"}', 45],
        ['{"partyId":"1"}', 38],
      ],
    },
    {
      groupBy: { groupByBatch: true },
      expected: [
        ['{"batchId":"batch-1-1"}', 11],
        ['{"batchId":"batch-1-2"}', 17],
        ['{"batchId":"batch-2-1"}', 9],
        ['{"batchId":"batch-2-2"}', 12],
        ['{"batchId":"batch-3-1"}', 34],
      ],
    },
    {
      groupBy: { groupByScanner: true },
      expected: [
        ['{"scannerId":"scanner-1"}', 28],
        ['{"scannerId":"scanner-2"}', 21],
        ['{"scannerId":"scanner-3"}', 34],
      ],
    },
    {
      groupBy: { groupByPrecinct: true },
      expected: [
        ['{"precinctId":"precinct-1"}', 28],
        ['{"precinctId":"precinct-2"}', 55],
      ],
    },
    {
      groupBy: { groupByVotingMethod: true },
      expected: [
        ['{"votingMethod":"early_voting"}', 0],
        ['{"votingMethod":"precinct"}', 68],
        ['{"votingMethod":"absentee"}', 15],
      ],
    },
  ];

  for (const { groupBy, expected } of testCases) {
    const groupedCardCounts = tabulateScannedCardCounts({
      electionId,
      election,
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

test('tabulateScannedCardCounts - groupByBatchDate', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const { election, electionData } =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  store.addScannerBatch({
    electionId,
    batchId: 'batch-day1-a',
    scannerId: 'scanner-1',
    label: 'Batch batch-day1-a',
    // Tests use Alaska TZ (UTC-9); UTC 18:00 unambiguously avoids date rollover
    startedAt: '2024-11-05T18:00:00.000Z',
  });
  store.addScannerBatch({
    electionId,
    batchId: 'batch-day1-b',
    scannerId: 'scanner-1',
    label: 'Batch batch-day1-b',
    startedAt: '2024-11-05T18:00:00.000Z',
  });
  store.addScannerBatch({
    electionId,
    batchId: 'batch-day2',
    scannerId: 'scanner-2',
    label: 'Batch batch-day2',
    startedAt: '2024-11-06T18:00:00.000Z',
  });

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-day1-a',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 10,
    },
    {
      ballotStyleGroupId: '2F',
      batchId: 'batch-day1-b',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 15,
    },
    {
      ballotStyleGroupId: '2F',
      batchId: 'batch-day2',
      scannerId: 'scanner-2',
      precinctId: 'precinct-2',
      votingMethod: 'absentee',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 7,
    },
  ];
  addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });

  // Without date grouping, each batch is its own group (3 total)
  expect(
    Object.values(
      tabulateScannedCardCounts({
        electionId,
        election,
        store,
        groupBy: { groupByBatch: true },
      })
    )
  ).toHaveLength(3);

  // With date grouping, batch-day1-a (10) and batch-day1-b (15) are merged
  // into a single group because they share the same date
  const groupedCardCounts = tabulateScannedCardCounts({
    electionId,
    election,
    store,
    groupBy: { groupByBatchDate: true },
  });

  expect(groupedCardCounts['{"batchDate":"2024-11-05"}']).toEqual({
    bmd: [25],
    hmpb: [],
  });
  expect(groupedCardCounts['{"batchDate":"2024-11-06"}']).toEqual({
    bmd: [7],
    hmpb: [],
  });
  expect(Object.values(groupedCardCounts)).toHaveLength(2);
  // Verify chronological sort order (oldest date first)
  expect(Object.keys(groupedCardCounts)).toEqual([
    '{"batchDate":"2024-11-05"}',
    '{"batchDate":"2024-11-06"}',
  ]);
});

test('tabulateFullCardCounts - groupByBatchDate with manual results', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const { election, electionData } =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  store.addScannerBatch({
    electionId,
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    label: 'Batch batch-1',
    // Tests use Alaska TZ (UTC-9); UTC 18:00 unambiguously avoids date rollover
    startedAt: '2024-11-05T18:00:00.000Z',
  });

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 30,
    },
  ];
  addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });

  store.setManualResults({
    electionId,
    precinctId: 'precinct-1',
    ballotStyleGroupId: '1M',
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
      election,
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

test('tabulateScannedCardCounts - merging card tallies', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const { election, electionData } =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // add some mock cast vote records with one vote each
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 5,
    },
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'hmpb', sheetNumber: 2 },
      multiplier: 7,
    },
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'hmpb', sheetNumber: 1 },
      multiplier: 6,
    },
  ];
  addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });

  const groupKey = getGroupKey({}, {});
  expect(
    tabulateScannedCardCounts({
      electionId,
      election,
      store,
    })[groupKey]
  ).toEqual({
    bmd: [5],
    hmpb: [6, 7],
  });

  expect(
    tabulateScannedCardCounts({
      electionId,
      election,
      store,
      groupBy: { groupByScanner: true },
    })['{"scannerId":"scanner-1"}']
  ).toEqual({
    bmd: [5],
    hmpb: [6, 7],
  });
});

test('tabulateFullCardCounts - manual results', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const { election, electionData } =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  // add mock scanned records
  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ballotStyleGroupId: '1M',
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { fishing: ['ban-fishing'] },
      card: { type: 'bmd' },
      multiplier: 30,
    },
  ];
  addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });

  // add manual results
  store.setManualResults({
    electionId,
    precinctId: 'precinct-1',
    ballotStyleGroupId: '1M',
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
      election,
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
      election,
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
      election,
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
      election,
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

test('tabulateFullCardCounts - blankBallots', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const { election, electionData } =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
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
    {
      ...cvrMetadata,
      card: { type: 'hmpb', sheetNumber: 1 },
      votes: { 'zoo-council-mammal': ['zebra', 'lion', 'kangaroo'] }, // marginal mark
      markScores: {
        'zoo-council-mammal': { zebra: 0.5, lion: 0.5, kangaroo: 0.06 },
      },
      multiplier: 2,
    },
  ];
  addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });

  const testCases: Array<{
    adjudicationFlags?: Admin.ReportingFilter['adjudicationFlags'];
    expectedBmd?: number;
    expectedHmpb?: number;
  }> = [
    {
      adjudicationFlags: [],
      expectedBmd: 15,
      expectedHmpb: 2,
    },
    {
      adjudicationFlags: ['isBlank'],
      expectedBmd: 1,
    },
    {
      adjudicationFlags: ['hasUndervote'],
      expectedBmd: 3,
    },
    {
      adjudicationFlags: ['hasOvervote'],
      expectedBmd: 4,
    },
    {
      adjudicationFlags: ['hasWriteIn'],
      expectedBmd: 5,
    },
    {
      adjudicationFlags: ['hasMarginalMark'],
      expectedHmpb: 2,
    },
  ];

  for (const testCase of testCases) {
    const [cardCounts] = groupMapToGroupList(
      tabulateFullCardCounts({
        electionId,
        election,
        store,
        filter: {
          adjudicationFlags: testCase.adjudicationFlags,
        },
      })
    );

    if (testCase.expectedBmd) {
      expect(cardCounts?.bmd).toEqual([testCase.expectedBmd]);
    }
    if (testCase.expectedHmpb) {
      expect(cardCounts?.hmpb).toEqual([testCase.expectedHmpb]);
    }
  }
});

test('tabulateFullCardCounts - hasCrossoverVote filter (combined ballot primary)', async () => {
  const store = Store.memoryStore(makeTemporaryDirectory());
  const { election, electionData } =
    electionCombinedBallotPrimaryFixtures.readElectionDefinition();
  const electionId = await store.addElection({
    electionData,
    systemSettingsData,
    electionPackageSourceFilePath: makeTemporaryFile(),
    electionPackageHash: 'test-election-package-hash',
  });
  store.setCurrentElectionId(electionId);

  const cvrMetadata = {
    ballotStyleGroupId: 'ballot-style-1' as BallotStyleGroupId,
    batchId: 'batch-1',
    scannerId: 'scanner-1',
    precinctId: 'precinct-1',
    votingMethod: 'precinct',
    card: { type: 'bmd' },
  } as const;

  const mockCastVoteRecordFile: MockCastVoteRecordFile = [
    {
      ...cvrMetadata,
      // Single-party Dem
      votes: {
        'governor-democratic': ['alice-jones'],
        'circuit-court-judge': ['margaret-chen'],
      },
      multiplier: 3,
    },
    {
      ...cvrMetadata,
      // Single-party Rep
      votes: {
        'governor-republican': ['dave-wilson'],
        'circuit-court-judge': ['margaret-chen'],
      },
      multiplier: 2,
    },
    {
      ...cvrMetadata,
      // Nonpartisan-only
      votes: { 'circuit-court-judge': ['margaret-chen'] },
      multiplier: 1,
    },
    {
      ...cvrMetadata,
      // Crossover
      votes: {
        'governor-democratic': ['alice-jones'],
        'governor-republican': ['dave-wilson'],
        'circuit-court-judge': ['margaret-chen'],
      },
      multiplier: 4,
    },
  ];
  addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile,
    store,
    pollingPlaceId: 'polling-place-1',
  });

  const [crossoverCounts] = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      election,
      store,
      filter: { adjudicationFlags: ['hasCrossoverVote'] },
    })
  );
  expect(crossoverCounts?.bmd).toEqual([4]);

  const [allCounts] = groupMapToGroupList(
    tabulateFullCardCounts({
      electionId,
      election,
      store,
      filter: { adjudicationFlags: [] },
    })
  );
  expect(allCounts?.bmd).toEqual([10]);
});
