import {
  AdjudicationReason,
  BallotMetadata,
  BallotType,
  CandidateContest,
  DEFAULT_SYSTEM_SETTINGS,
  InterpretedHmpbPage,
  mapSheet,
  PageInterpretationWithFiles,
  SheetOf,
  TEST_JURISDICTION,
  YesNoContest,
} from '@votingworks/types';
import {
  ALL_PRECINCTS_SELECTION,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import * as tmp from 'tmp';
import { v4 as uuid } from 'uuid';
import { sleep } from '@votingworks/basics';
import { AcceptedSheet, RejectedSheet } from '@votingworks/backend';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import { sha256 } from 'js-sha256';
import { zeroRect } from '../test/fixtures/zero_rect';
import { Store } from './store';

// We pause in some of these tests so we need to increase the timeout
jest.setTimeout(20000);

const jurisdiction = TEST_JURISDICTION;
const { electionDefinition } = electionGridLayoutNewHampshireTestBallotFixtures;
const { election, electionData, electionHash } = electionDefinition;

test('get/set election', () => {
  const store = Store.memoryStore();

  expect(store.getElectionDefinition()).toBeUndefined();
  expect(store.hasElection()).toBeFalsy();

  store.setElectionAndJurisdiction({ electionData, jurisdiction });
  expect(store.getElectionDefinition()?.election).toEqual(election);
  expect(store.hasElection()).toBeTruthy();

  store.setElectionAndJurisdiction(undefined);
  expect(store.getElectionDefinition()).toBeUndefined();
});

test('get/set test mode', () => {
  const store = Store.memoryStore();

  // Before setting an election
  expect(store.getTestMode()).toEqual(true);
  expect(() => store.setTestMode(false)).toThrowError();

  store.setElectionAndJurisdiction({ electionData, jurisdiction });

  // After setting an election
  expect(store.getTestMode()).toEqual(true);

  store.setTestMode(false);
  expect(store.getTestMode()).toEqual(false);

  store.setTestMode(true);
  expect(store.getTestMode()).toEqual(true);
});

test('get/set is sounds muted mode', () => {
  const store = Store.memoryStore();

  // Before setting an election
  expect(store.getIsSoundMuted()).toEqual(false);
  expect(() => store.setIsSoundMuted(true)).toThrowError();

  store.setElectionAndJurisdiction({ electionData, jurisdiction });

  // After setting an election
  expect(store.getIsSoundMuted()).toEqual(false);

  store.setIsSoundMuted(true);
  expect(store.getIsSoundMuted()).toEqual(true);

  store.setIsSoundMuted(false);
  expect(store.getIsSoundMuted()).toEqual(false);
});

test('get/set ballot count when ballot bag last replaced', () => {
  const store = Store.memoryStore();

  // Before setting an election
  expect(store.getBallotCountWhenBallotBagLastReplaced()).toEqual(0);
  expect(() =>
    store.setBallotCountWhenBallotBagLastReplaced(1500)
  ).toThrowError();

  store.setElectionAndJurisdiction({ electionData, jurisdiction });

  // After setting an election
  expect(store.getBallotCountWhenBallotBagLastReplaced()).toEqual(0);

  store.setBallotCountWhenBallotBagLastReplaced(1500);
  expect(store.getBallotCountWhenBallotBagLastReplaced()).toEqual(1500);
});

test('get/set precinct selection', () => {
  const store = Store.memoryStore();

  // Before setting an election
  expect(store.getPrecinctSelection()).toEqual(undefined);
  expect(() =>
    store.setPrecinctSelection(ALL_PRECINCTS_SELECTION)
  ).toThrowError();

  store.setElectionAndJurisdiction({ electionData, jurisdiction });

  // After setting an election
  expect(store.getPrecinctSelection()).toEqual(undefined);

  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  expect(store.getPrecinctSelection()).toEqual(ALL_PRECINCTS_SELECTION);

  const precinctSelection = singlePrecinctSelectionFor('precinct-1');
  store.setPrecinctSelection(precinctSelection);
  expect(store.getPrecinctSelection()).toMatchObject(precinctSelection);
});

test('get/set polls state', () => {
  const store = Store.memoryStore();

  // Before setting an election
  expect(store.getPollsState()).toEqual('polls_closed_initial');
  expect(() => store.setPollsState('polls_open')).toThrowError();

  store.setElectionAndJurisdiction({ electionData, jurisdiction });

  // After setting an election
  store.setPollsState('polls_open');
  expect(store.getPollsState()).toEqual('polls_open');
});

test('get/set scanner as backed up', () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({ electionData, jurisdiction });
  expect(store.getScannerBackupTimestamp()).toBeFalsy();
  store.setScannerBackedUp();
  expect(store.getScannerBackupTimestamp()).toBeTruthy();
  store.setScannerBackedUp(false);
  expect(store.getScannerBackupTimestamp()).toBeFalsy();
});

test('batch cleanup works correctly', () => {
  const dbFile = tmp.fileSync();
  const store = Store.fileStore(dbFile.name);

  store.reset();

  const firstBatchId = store.addBatch();
  store.addBatch();
  store.finishBatch({ batchId: firstBatchId });
  store.cleanupIncompleteBatches();

  const batches = store.getBatches();
  expect(batches).toHaveLength(1);
  expect(batches[0].id).toEqual(firstBatchId);
  expect(batches[0].batchNumber).toEqual(1);
  expect(batches[0].label).toEqual('Batch 1');

  const thirdBatchId = store.addBatch();
  store.addBatch();
  store.finishBatch({ batchId: thirdBatchId });
  store.cleanupIncompleteBatches();
  const updatedBatches = store.getBatches();
  expect(
    [...updatedBatches].sort((a, b) => a.label.localeCompare(b.label))
  ).toEqual([
    expect.objectContaining({
      id: firstBatchId,
      batchNumber: 1,
      label: 'Batch 1',
    }),
    expect.objectContaining({
      id: thirdBatchId,
      batchNumber: 3,
      label: 'Batch 3',
    }),
  ]);
});

test('getBatches', () => {
  const store = Store.memoryStore();

  // Create a batch and add a sheet to it
  const batchId = store.addBatch();
  const sheetId = store.addSheet(uuid(), batchId, [
    {
      imagePath: '/tmp/front-page.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
    {
      imagePath: '/tmp/back-page.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
  ]);

  // Add a second sheet
  const sheetId2 = store.addSheet(uuid(), batchId, [
    {
      imagePath: '/tmp/front-page2.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
    {
      imagePath: '/tmp/back-page2.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
  ]);
  let batches = store.getBatches();
  expect(batches).toHaveLength(1);
  expect(batches[0].count).toEqual(2);

  // Delete one of the sheets
  store.deleteSheet(sheetId);
  batches = store.getBatches();
  expect(batches).toHaveLength(1);
  expect(batches[0].count).toEqual(1);

  // Delete the last sheet, then confirm that store.getBatches() results still include the batch
  store.deleteSheet(sheetId2);
  batches = store.getBatches();
  expect(batches).toHaveLength(1);
  expect(batches[0].count).toEqual(0);

  // Confirm that batches marked as deleted are not included
  store.deleteBatch(batchId);
  batches = store.getBatches();
  expect(batches).toHaveLength(0);
});

test('canUnconfigure in test mode', () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({ electionData, jurisdiction });
  store.setTestMode(true);

  // With an unexported batch, we should be able to unconfigure the machine in test mode
  store.addBatch();
  expect(store.getCanUnconfigure()).toEqual(true);
});

test('canUnconfigure not in test mode', async () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({ electionData, jurisdiction });
  store.setTestMode(false);

  // Can unconfigure if no batches added
  expect(store.getCanUnconfigure()).toEqual(true);

  // Create a batch
  const batchId = store.addBatch();

  // Can unconfigure if only empty batches added
  expect(store.getCanUnconfigure()).toEqual(true);

  // Cannot unconfigure after new sheet added
  const sheetId = store.addSheet(uuid(), batchId, [
    {
      imagePath: '/tmp/front-page.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
    {
      imagePath: '/tmp/back-page.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
  ]);
  expect(store.getCanUnconfigure()).toEqual(false);
  store.setScannerBackedUp();
  expect(store.getCanUnconfigure()).toEqual(true);

  // Setup second batch with second sheet
  await sleep(1000);
  const batchId2 = store.addBatch();
  store.addSheet(uuid(), batchId2, [
    {
      imagePath: '/tmp/front-page2.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
    {
      imagePath: '/tmp/back-page2.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
  ]);
  expect(store.getCanUnconfigure()).toEqual(false);
  store.setScannerBackedUp();
  expect(store.getCanUnconfigure()).toEqual(true);

  // Setup third batch with third sheet
  await sleep(1000);
  const batchId3 = store.addBatch();
  const sheetId3 = store.addSheet(uuid(), batchId3, [
    {
      imagePath: '/tmp/front-page3.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
    {
      imagePath: '/tmp/back-page3.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
  ]);
  expect(store.getCanUnconfigure()).toEqual(false);
  store.setScannerBackedUp();
  expect(store.getCanUnconfigure()).toEqual(true);

  // Cannot unconfigure after sheet deleted
  await sleep(1000);
  store.deleteSheet(sheetId);
  expect(store.getCanUnconfigure()).toEqual(false);
  store.setScannerBackedUp();
  expect(store.getCanUnconfigure()).toEqual(true);

  // Can unconfigure after empty batch deleted
  await sleep(1000);
  store.deleteBatch(batchId);
  expect(store.getCanUnconfigure()).toEqual(true);

  // Cannot unconfigure after non-empty batch deleted
  await sleep(1000);
  store.deleteBatch(batchId2);
  expect(store.getCanUnconfigure()).toEqual(false);
  store.setScannerBackedUp();
  expect(store.getCanUnconfigure()).toEqual(true);

  // Can unconfigure if no counted ballots
  await sleep(1000);
  store.deleteSheet(sheetId3);
  expect(store.getCanUnconfigure()).toEqual(true);
});

test('adjudication', () => {
  const candidateContests = election.contests.filter(
    (contest): contest is CandidateContest => contest.type === 'candidate'
  );
  const yesnoContests = election.contests.filter(
    (contest): contest is YesNoContest => contest.type === 'yesno'
  );

  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({ electionData, jurisdiction });
  function fakePage(i: 0 | 1): PageInterpretationWithFiles {
    const metadata: BallotMetadata = {
      electionHash,
      ballotStyleId: '12',
      precinctId: '23',
      isTestMode: false,
      ballotType: BallotType.Precinct,
    };
    return {
      imagePath: i === 0 ? '/front.png' : '/back.png',
      interpretation: {
        type: 'InterpretedHmpbPage',
        votes: {},
        markInfo: {
          ballotSize: { width: 800, height: 1000 },
          marks: [
            {
              type: 'candidate',
              contestId: candidateContests[i].id,
              optionId: candidateContests[i].candidates[0].id,
              score: 0.06, // marginal
              scoredOffset: { x: 0, y: 0 },
              bounds: zeroRect,
              target: {
                bounds: zeroRect,
                inner: zeroRect,
              },
            },
            ...(yesnoContests[i]
              ? ([
                  {
                    type: 'yesno',
                    contestId: yesnoContests[i].id,
                    optionId: yesnoContests[i].yesOption.id,
                    score: 1, // definite
                    scoredOffset: { x: 0, y: 0 },
                    bounds: zeroRect,
                    target: {
                      bounds: zeroRect,
                      inner: zeroRect,
                    },
                  },
                ] as const)
              : []),
          ],
        },
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
        adjudicationInfo: {
          requiresAdjudication: true,
          enabledReasons: [AdjudicationReason.MarginalMark],
          enabledReasonInfos: [
            {
              type: AdjudicationReason.MarginalMark,
              contestId: candidateContests[i].id,
              optionId: candidateContests[i].candidates[0].id,
              optionIndex: 0,
            },
            {
              type: AdjudicationReason.Undervote,
              contestId: candidateContests[i].id,
              expected: 1,
              optionIds: [],
              optionIndexes: [],
            },
          ],
          ignoredReasonInfos: [],
        },
        layout: {
          pageSize: { width: 0, height: 0 },
          metadata: {
            ...metadata,
            pageNumber: 1,
          },
          contests: [],
        },
      },
    };
  }
  const batchId = store.addBatch();
  const ballotId = store.addSheet(uuid(), batchId, [fakePage(0), fakePage(1)]);

  // check the review paths
  const reviewSheet = store.getNextAdjudicationSheet();
  expect(reviewSheet?.id).toEqual(ballotId);

  store.finishBatch({ batchId });

  // cleaning up batches now should have no impact
  store.cleanupIncompleteBatches();
});

const metadata: BallotMetadata = {
  electionHash,
  ballotStyleId: '12',
  precinctId: '23',
  isTestMode: false,
  ballotType: BallotType.Precinct,
};
const sheetWithFiles: SheetOf<PageInterpretationWithFiles> = [
  {
    imagePath: '/front.png',
    interpretation: {
      type: 'InterpretedHmpbPage',
      votes: {},
      markInfo: {
        ballotSize: { width: 800, height: 1000 },
        marks: [],
      },
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      adjudicationInfo: {
        requiresAdjudication: false,
        enabledReasons: [],
        enabledReasonInfos: [],
        ignoredReasonInfos: [],
      },
      layout: {
        pageSize: { width: 0, height: 0 },
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
        contests: [],
      },
    },
  },
  {
    imagePath: '/back.png',
    interpretation: {
      type: 'InterpretedHmpbPage',
      votes: {},
      markInfo: {
        ballotSize: { width: 800, height: 1000 },
        marks: [],
      },
      metadata: {
        ...metadata,
        pageNumber: 2,
      },
      adjudicationInfo: {
        requiresAdjudication: false,
        enabledReasons: [],
        enabledReasonInfos: [],
        ignoredReasonInfos: [],
      },
      layout: {
        pageSize: { width: 0, height: 0 },
        metadata: {
          ...metadata,
          pageNumber: 2,
        },
        contests: [],
      },
    },
  },
];
test('iterating over sheets', () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
        .electionData,
    jurisdiction,
  });

  expect(Array.from(store.forEachAcceptedSheet())).toEqual([]);
  expect(Array.from(store.forEachSheet())).toEqual([]);

  // Add and retrieve an accepted sheet
  const batchId = store.addBatch();
  const sheet1Id = uuid();
  store.addSheet(sheet1Id, batchId, [
    { ...sheetWithFiles[0], imagePath: '1-front.jpg' },
    { ...sheetWithFiles[1], imagePath: '1-back.jpg' },
  ]);
  const expectedSheet1: AcceptedSheet = {
    type: 'accepted',
    id: sheet1Id,
    batchId,
    interpretation: mapSheet(sheetWithFiles, (page) => page.interpretation),
    frontImagePath: '1-front.jpg',
    backImagePath: '1-back.jpg',
    indexInBatch: 1,
  };
  expect(Array.from(store.forEachAcceptedSheet())).toEqual([expectedSheet1]);
  expect(Array.from(store.forEachSheet())).toEqual([expectedSheet1]);

  // Add and retrieve a rejected sheet
  const sheet2Id = uuid();
  store.addSheet(sheet2Id, batchId, [
    { ...sheetWithFiles[0], imagePath: '2-front.jpg' },
    { ...sheetWithFiles[1], imagePath: '2-back.jpg' },
  ]);
  store.deleteSheet(sheet2Id);
  const expectedSheet2: RejectedSheet = {
    type: 'rejected',
    id: sheet2Id,
    frontImagePath: '2-front.jpg',
    backImagePath: '2-back.jpg',
  };
  expect(Array.from(store.forEachAcceptedSheet())).toEqual([expectedSheet1]);
  expect(Array.from(store.forEachSheet())).toEqual([
    expectedSheet1,
    expectedSheet2,
  ]);

  // Add and retrieve an accepted adjudicated sheet
  const sheet3Id = uuid();
  const interpretationRequiringAdjudication: InterpretedHmpbPage = {
    ...(sheetWithFiles[0].interpretation as InterpretedHmpbPage),
    adjudicationInfo: {
      requiresAdjudication: true,
      enabledReasons: [AdjudicationReason.Overvote],
      enabledReasonInfos: [],
      ignoredReasonInfos: [],
    },
  };
  store.addSheet(sheet3Id, batchId, [
    {
      ...sheetWithFiles[0],
      imagePath: '3-front.jpg',
      interpretation: interpretationRequiringAdjudication,
    },
    { ...sheetWithFiles[1], imagePath: '3-back.jpg' },
  ]);
  store.adjudicateSheet(sheet3Id);
  const expectedSheet3: AcceptedSheet = {
    type: 'accepted',
    id: sheet3Id,
    batchId,
    interpretation: [
      interpretationRequiringAdjudication,
      sheetWithFiles[1].interpretation,
    ],
    frontImagePath: '3-front.jpg',
    backImagePath: '3-back.jpg',
    indexInBatch: 2,
  };
  expect(Array.from(store.forEachAcceptedSheet())).toEqual([
    expectedSheet1,
    expectedSheet3,
  ]);
  expect(Array.from(store.forEachSheet())).toEqual([
    expectedSheet1,
    expectedSheet2,
    { ...expectedSheet3, indexInBatch: 3 },
  ]);

  // Mark batch as deleted
  store.deleteBatch(batchId);
  expect(Array.from(store.forEachAcceptedSheet())).toEqual([]);
  expect(Array.from(store.forEachSheet())).toEqual([]);
});

test('iterating over each accepted sheet includes correct batch sequence id', () => {
  const store = Store.memoryStore();
  store.setElectionAndJurisdiction({ electionData, jurisdiction });

  // the filenames must be unique in the database so, to insert multiple sheets
  // for this test we must include random filenames with the fixture
  function generateSheet(): SheetOf<PageInterpretationWithFiles> {
    return [
      {
        ...sheetWithFiles[0],
        imagePath: uuid(),
      },
      {
        ...sheetWithFiles[1],
        imagePath: uuid(),
      },
    ];
  }

  const batch1Id = store.addBatch();
  const batch1Sheet1Id = store.addSheet(uuid(), batch1Id, generateSheet());
  const batch1Sheet2Id = store.addSheet(uuid(), batch1Id, generateSheet());
  const batch1Sheet3Id = store.addSheet(uuid(), batch1Id, generateSheet());
  store.finishBatch({ batchId: batch1Id });

  const batch2Id = store.addBatch();
  const batch2Sheet1Id = store.addSheet(uuid(), batch2Id, generateSheet());
  store.finishBatch({ batchId: batch2Id });

  const batch3Id = store.addBatch();
  const batch3Sheet1Id = store.addSheet(uuid(), batch3Id, generateSheet());
  const batch3Sheet2Id = store.addSheet(uuid(), batch3Id, generateSheet());
  store.finishBatch({ batchId: batch3Id });

  const acceptedSheets = Array.from(store.forEachAcceptedSheet());
  expect(acceptedSheets).toHaveLength(6);
  const expectedAcceptedSheets: Array<
    [id: string, batchId: string, indexInBatch: number]
  > = [
    [batch1Sheet1Id, batch1Id, 1],
    [batch1Sheet2Id, batch1Id, 2],
    [batch1Sheet3Id, batch1Id, 3],
    [batch2Sheet1Id, batch2Id, 1],
    [batch3Sheet1Id, batch3Id, 1],
    [batch3Sheet2Id, batch3Id, 2],
  ];
  for (const expectedAcceptedSheet of expectedAcceptedSheets) {
    expect(acceptedSheets).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          id: expectedAcceptedSheet[0],
          batchId: expectedAcceptedSheet[1],
          indexInBatch: expectedAcceptedSheet[2],
        }),
      ])
    );
  }
});

test('resetElectionSession', () => {
  const dbFile = tmp.fileSync();
  const store = Store.fileStore(dbFile.name);
  store.setElectionAndJurisdiction({ electionData, jurisdiction });

  store.setPollsState('polls_open');
  store.setBallotCountWhenBallotBagLastReplaced(1500);

  store.addBatch();
  store.addBatch();
  expect(
    store
      .getBatches()
      .map((batch) => batch.label)
      .sort((a, b) => a.localeCompare(b))
  ).toEqual(['Batch 1', 'Batch 2']);

  store.setScannerBackedUp();

  store.resetElectionSession();

  // resetElectionSession should reset election session state
  expect(store.getPollsState()).toEqual('polls_closed_initial');
  expect(store.getBallotCountWhenBallotBagLastReplaced()).toEqual(0);
  expect(store.getScannerBackupTimestamp()).toBeFalsy();

  // resetElectionSession should clear all batches
  expect(store.getBatches()).toEqual([]);

  // resetElectionSession should reset the autoincrement in the batch label
  store.addBatch();
  store.addBatch();
  expect(
    store
      .getBatches()
      .map((batch) => batch.label)
      .sort((a, b) => a.localeCompare(b))
  ).toEqual(['Batch 1', 'Batch 2']);
});

test('getBallotsCounted', () => {
  const store = Store.memoryStore();

  expect(store.getBallotsCounted()).toEqual(0);

  // Create a batch and add a sheet to it
  const batchId = store.addBatch();
  store.addSheet(uuid(), batchId, [
    {
      imagePath: '/tmp/front-page.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
    {
      imagePath: '/tmp/back-page.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
  ]);

  expect(store.getBallotsCounted()).toEqual(1);
  store.finishBatch({ batchId });
  expect(store.getBallotsCounted()).toEqual(1);

  // Create a second batch and add a second and third sheet
  const batch2Id = store.addBatch();
  store.addSheet(uuid(), batch2Id, [
    {
      imagePath: '/tmp/front-page2.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
    {
      imagePath: '/tmp/back-page2.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
  ]);

  expect(store.getBallotsCounted()).toEqual(2);

  const sheetId3 = store.addSheet(uuid(), batch2Id, [
    {
      imagePath: '/tmp/front-page3.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
    {
      imagePath: '/tmp/back-page3.png',
      interpretation: {
        type: 'UnreadablePage',
      },
    },
  ]);

  expect(store.getBallotsCounted()).toEqual(3);
  store.finishBatch({ batchId: batch2Id });
  expect(store.getBallotsCounted()).toEqual(3);

  // Delete one of the sheets
  store.deleteSheet(sheetId3);
  expect(store.getBallotsCounted()).toEqual(2);

  // Delete one of the batches
  store.deleteBatch(batchId);
  expect(store.getBallotsCounted()).toEqual(1);
});

test('systemSettings can set/get/delete', () => {
  const store = Store.memoryStore();
  const systemSettings = DEFAULT_SYSTEM_SETTINGS;
  store.setSystemSettings(systemSettings);
  const systemSettingsInStore = store.getSystemSettings();
  expect(systemSettingsInStore).toEqual(DEFAULT_SYSTEM_SETTINGS);
  store.deleteSystemSettings();
  expect(store.getSystemSettings()).toBeUndefined();
});

test('getCastVoteRecordRootHash, updateCastVoteRecordHashes, and clearCastVoteRecordHashes', () => {
  const store = Store.memoryStore();

  // Just test that the store has been wired properly. Rely on libs/auth tests for more detailed
  // coverage of hashing logic.
  expect(store.getCastVoteRecordRootHash()).toEqual('');
  store.updateCastVoteRecordHashes(
    'abcd1234-0000-0000-0000-000000000000',
    sha256('')
  );
  expect(store.getCastVoteRecordRootHash()).toEqual(
    sha256(sha256(sha256(sha256(''))))
  );
  store.clearCastVoteRecordHashes();
  expect(store.getCastVoteRecordRootHash()).toEqual('');
});
