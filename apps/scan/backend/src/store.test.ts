import {
  AcceptedSheet,
  doesUsbDriveRequireCastVoteRecordSync,
  RejectedSheet,
  Sheet,
} from '@votingworks/backend';
import {
  electionGridLayoutNewHampshireTestBallotFixtures,
  electionTwoPartyPrimaryFixtures,
  makeTemporaryFile,
} from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import {
  AdjudicationReason,
  BallotMetadata,
  BallotStyleId,
  BallotType,
  InterpretedHmpbPage,
  mapSheet,
  PageInterpretationWithFiles,
  safeParseSystemSettings,
  SheetOf,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import {
  ALL_PRECINCTS_SELECTION,
  getFeatureFlagMock,
  singlePrecinctSelectionFor,
} from '@votingworks/utils';
import { sha256 } from 'js-sha256';
import { DateTime } from 'luxon';
import { v4 as uuid } from 'uuid';
import { expect, test, vi } from 'vitest';

import { Store } from './store';

// We pause in some of these tests so we need to increase the timeout
vi.setConfig({ testTimeout: 20000 });

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

const jurisdiction = TEST_JURISDICTION;
const electionPackageHash = 'test-election-package-hash';

const testMetadata: BallotMetadata = {
  ballotStyleId: '12' as BallotStyleId,
  ballotType: BallotType.Precinct,
  ballotHash:
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
      .ballotHash,
  isTestMode: false,
  precinctId: '23',
};

const testSheetWithFiles: SheetOf<PageInterpretationWithFiles> = [
  {
    imagePath: '/front.png',
    interpretation: {
      type: 'InterpretedHmpbPage',
      adjudicationInfo: {
        requiresAdjudication: false,
        enabledReasons: [],
        enabledReasonInfos: [],
        ignoredReasonInfos: [],
      },
      layout: {
        contests: [],
        metadata: { ...testMetadata, pageNumber: 1 },
        pageSize: { width: 0, height: 0 },
      },
      markInfo: {
        ballotSize: { height: 1000, width: 800 },
        marks: [],
      },
      metadata: { ...testMetadata, pageNumber: 1 },
      votes: {},
    },
  },
  {
    imagePath: '/back.png',
    interpretation: {
      type: 'InterpretedHmpbPage',
      adjudicationInfo: {
        requiresAdjudication: false,
        enabledReasons: [],
        enabledReasonInfos: [],
        ignoredReasonInfos: [],
      },
      layout: {
        contests: [],
        metadata: { ...testMetadata, pageNumber: 2 },
        pageSize: { width: 0, height: 0 },
      },
      markInfo: {
        ballotSize: { height: 1000, width: 800 },
        marks: [],
      },
      metadata: { ...testMetadata, pageNumber: 2 },
      votes: {},
    },
  },
];

function sortSheets(sheets: Sheet[]): Sheet[] {
  return [...sheets].sort((s1, s2) => s1.id.localeCompare(s2.id));
}

test('get/set election', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  expect(store.getElectionRecord()).toBeUndefined();
  expect(store.hasElection()).toBeFalsy();

  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    jurisdiction,
    electionPackageHash,
  });
  expect(store.getElectionRecord()).toEqual({
    electionDefinition:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition(),
    electionPackageHash,
  });
  expect(store.hasElection()).toBeTruthy();

  store.setElectionAndJurisdiction(undefined);
  expect(store.getElectionRecord()).toBeUndefined();
});

test('get/set system settings', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  expect(store.getSystemSettings()).toBeUndefined();
  const systemSettings = safeParseSystemSettings(
    electionTwoPartyPrimaryFixtures.systemSettings.asText()
  ).unsafeUnwrap();

  store.setSystemSettings(systemSettings);
  expect(store.getSystemSettings()).toEqual(systemSettings);
});

test('get/set test mode', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  // Before setting an election
  expect(store.getTestMode()).toEqual(true);
  expect(() => store.setTestMode(false)).toThrowError();

  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    jurisdiction,
    electionPackageHash,
  });

  // After setting an election
  expect(store.getTestMode()).toEqual(true);

  store.setTestMode(false);
  expect(store.getTestMode()).toEqual(false);

  store.setTestMode(true);
  expect(store.getTestMode()).toEqual(true);
});

test('get/set is sounds muted mode', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  // Before setting an election
  expect(store.getIsSoundMuted()).toEqual(false);
  expect(() => store.setIsSoundMuted(true)).toThrowError();

  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    jurisdiction,
    electionPackageHash,
  });

  // After setting an election
  expect(store.getIsSoundMuted()).toEqual(false);

  store.setIsSoundMuted(true);
  expect(store.getIsSoundMuted()).toEqual(true);

  store.setIsSoundMuted(false);
  expect(store.getIsSoundMuted()).toEqual(false);
});

test('get/set is double feed detection disabled mode', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  // Before setting an election
  expect(store.getIsDoubleFeedDetectionDisabled()).toEqual(false);
  expect(() => store.setIsDoubleFeedDetectionDisabled(true)).toThrowError();

  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    jurisdiction,
    electionPackageHash,
  });

  // After setting an election
  expect(store.getIsDoubleFeedDetectionDisabled()).toEqual(false);

  store.setIsDoubleFeedDetectionDisabled(true);
  expect(store.getIsDoubleFeedDetectionDisabled()).toEqual(true);

  store.setIsDoubleFeedDetectionDisabled(false);
  expect(store.getIsDoubleFeedDetectionDisabled()).toEqual(false);
});

test('get/set isContinuousExportEnabled', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  // Before setting an election
  expect(store.getIsContinuousExportEnabled()).toEqual(true);
  expect(() => store.setIsContinuousExportEnabled(true)).toThrowError();

  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    electionPackageHash,
    jurisdiction,
  });

  expect(store.getIsContinuousExportEnabled()).toEqual(true);

  store.setIsContinuousExportEnabled(false);
  expect(store.getIsContinuousExportEnabled()).toEqual(false);

  store.setIsContinuousExportEnabled(true);
  expect(store.getIsContinuousExportEnabled()).toEqual(true);

  store.setIsContinuousExportEnabled(false);
  expect(store.getIsContinuousExportEnabled()).toEqual(false);

  // Make sure that resetting election session resumes continuous export if paused
  store.resetElectionSession();
  expect(store.getIsContinuousExportEnabled()).toEqual(true);
});

test('get/set precinct selection', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  // Before setting an election
  expect(store.getPrecinctSelection()).toEqual(undefined);
  expect(() =>
    store.setPrecinctSelection(ALL_PRECINCTS_SELECTION)
  ).toThrowError();

  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    jurisdiction,
    electionPackageHash,
  });

  // After setting an election
  expect(store.getPrecinctSelection()).toEqual(undefined);

  store.setPrecinctSelection(ALL_PRECINCTS_SELECTION);
  expect(store.getPrecinctSelection()).toEqual(ALL_PRECINCTS_SELECTION);

  const precinctSelection = singlePrecinctSelectionFor('precinct-1');
  store.setPrecinctSelection(precinctSelection);
  expect(store.getPrecinctSelection()).toMatchObject(precinctSelection);
});

test('get/set polls state', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  // Before setting an election
  expect(store.getPollsState()).toEqual('polls_closed_initial');
  expect(() =>
    store.transitionPolls({ type: 'open_polls', time: Date.now() })
  ).toThrowError();
  expect(() => store.getLastPollsTransition()).toThrowError();

  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    jurisdiction,
    electionPackageHash,
  });

  // After setting an election
  const openPollsTime = Date.now();
  store.transitionPolls({ type: 'open_polls', time: openPollsTime });
  expect(store.getPollsState()).toEqual('polls_open');
  expect(store.getLastPollsTransition()).toEqual({
    type: 'open_polls',
    time: openPollsTime,
    ballotCount: 0,
  });
});

test('batch cleanup works correctly', () => {
  const dbFile = makeTemporaryFile();
  const store = Store.fileStore(dbFile, mockBaseLogger({ fn: vi.fn }));

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
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

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

test('iterating over sheets', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));
  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    jurisdiction,
    electionPackageHash,
  });

  expect(Array.from(store.forEachAcceptedSheet())).toEqual([]);
  expect(Array.from(store.forEachSheet())).toEqual([]);

  // Add and retrieve an accepted sheet
  const batchId = store.addBatch();
  const sheet1Id = uuid();
  store.addSheet(sheet1Id, batchId, [
    { ...testSheetWithFiles[0], imagePath: '1-front.jpg' },
    { ...testSheetWithFiles[1], imagePath: '1-back.jpg' },
  ]);
  const expectedSheet1: AcceptedSheet = {
    type: 'accepted',
    id: sheet1Id,
    batchId,
    interpretation: mapSheet(testSheetWithFiles, (page) => page.interpretation),
    frontImagePath: '1-front.jpg',
    backImagePath: '1-back.jpg',
  };
  expect(Array.from(store.forEachAcceptedSheet())).toEqual([expectedSheet1]);
  expect(Array.from(store.forEachSheet())).toEqual([expectedSheet1]);

  // Add and retrieve a rejected sheet
  const sheet2Id = uuid();
  store.addSheet(sheet2Id, batchId, [
    { ...testSheetWithFiles[0], imagePath: '2-front.jpg' },
    { ...testSheetWithFiles[1], imagePath: '2-back.jpg' },
  ]);
  store.deleteSheet(sheet2Id);
  const expectedSheet2: RejectedSheet = {
    type: 'rejected',
    id: sheet2Id,
    frontImagePath: '2-front.jpg',
    backImagePath: '2-back.jpg',
  };
  expect(Array.from(store.forEachAcceptedSheet())).toEqual([expectedSheet1]);
  expect(Array.from(store.forEachSheet())).toEqual(
    sortSheets([expectedSheet1, expectedSheet2])
  );

  // Add and retrieve an accepted adjudicated sheet
  const sheet3Id = uuid();
  const interpretationRequiringAdjudication: InterpretedHmpbPage = {
    ...(testSheetWithFiles[0].interpretation as InterpretedHmpbPage),
    adjudicationInfo: {
      requiresAdjudication: true,
      enabledReasons: [AdjudicationReason.Overvote],
      enabledReasonInfos: [],
      ignoredReasonInfos: [],
    },
  };
  store.addSheet(sheet3Id, batchId, [
    {
      ...testSheetWithFiles[0],
      imagePath: '3-front.jpg',
      interpretation: interpretationRequiringAdjudication,
    },
    { ...testSheetWithFiles[1], imagePath: '3-back.jpg' },
  ]);
  store.adjudicateSheet(sheet3Id);
  const expectedSheet3: AcceptedSheet = {
    type: 'accepted',
    id: sheet3Id,
    batchId,
    interpretation: [
      interpretationRequiringAdjudication,
      testSheetWithFiles[1].interpretation,
    ],
    frontImagePath: '3-front.jpg',
    backImagePath: '3-back.jpg',
  };
  expect(Array.from(store.forEachAcceptedSheet())).toEqual(
    sortSheets([expectedSheet1, expectedSheet3])
  );
  expect(Array.from(store.forEachSheet())).toEqual(
    sortSheets([expectedSheet1, expectedSheet2, expectedSheet3])
  );

  // Mark batch as deleted
  store.deleteBatch(batchId);
  expect(Array.from(store.forEachAcceptedSheet())).toEqual([]);
  expect(Array.from(store.forEachSheet())).toEqual([]);
});

test('getSheet', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  const batchId = store.addBatch();
  const sheetId = uuid();
  store.addSheet(sheetId, batchId, testSheetWithFiles);
  expect(store.getSheet(sheetId)).toEqual({
    type: 'accepted',
    id: sheetId,
    batchId,
    interpretation: mapSheet(testSheetWithFiles, (page) => page.interpretation),
    frontImagePath: '/front.png',
    backImagePath: '/back.png',
  });

  store.deleteSheet(sheetId);
  expect(store.getSheet(sheetId)).toEqual({
    type: 'rejected',
    id: sheetId,
    frontImagePath: '/front.png',
    backImagePath: '/back.png',
  });

  expect(store.getSheet('non-existent-id')).toEqual(undefined);
});

test('resetElectionSession', async () => {
  const dbFile = makeTemporaryFile();
  const store = Store.fileStore(dbFile, mockBaseLogger({ fn: vi.fn }));
  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    jurisdiction,
    electionPackageHash,
  });
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});
  const mockUsbDriveStatus = await mockUsbDrive.usbDrive.status();

  store.transitionPolls({ type: 'open_polls', time: Date.now() });

  store.addBatch();
  const batch2Id = store.addBatch();
  expect(
    store
      .getBatches()
      .map((batch) => batch.label)
      .sort((a, b) => a.localeCompare(b))
  ).toEqual(['Batch 1', 'Batch 2']);

  store.addSheet(uuid(), batch2Id, testSheetWithFiles);
  expect(Array.from(store.forEachSheet())).toHaveLength(1);

  store.setExportDirectoryName('export-directory-name');
  store.addPendingContinuousExportOperation(
    'abcd1234-0000-0000-0000-000000000000'
  );
  store.updateCastVoteRecordHashes(
    'abcd1234-0000-0000-0000-000000000000',
    sha256('')
  );
  expect(
    await doesUsbDriveRequireCastVoteRecordSync(store, mockUsbDriveStatus)
  ).toEqual(true);

  store.resetElectionSession();

  // resetElectionSession should reset election session state
  expect(store.getPollsState()).toEqual('polls_closed_initial');

  // resetElectionSession should clear all batches
  expect(store.getBatches()).toEqual([]);
  expect(Array.from(store.forEachSheet())).toHaveLength(0);

  // resetElectionSession should reset the autoincrement in the batch label
  store.addBatch();
  store.addBatch();
  expect(
    store
      .getBatches()
      .map((batch) => batch.label)
      .sort((a, b) => a.localeCompare(b))
  ).toEqual(['Batch 1', 'Batch 2']);

  // resetElectionSession should reset all export-related metadata
  expect(store.getExportDirectoryName()).toEqual(undefined);
  expect(store.getPendingContinuousExportOperations()).toEqual([]);
  expect(store.getCastVoteRecordRootHash()).toEqual('');
  expect(
    await doesUsbDriveRequireCastVoteRecordSync(store, mockUsbDriveStatus)
  ).toEqual(false);
});

test('getBallotsCounted', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

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

test('getExportDirectoryName and setExportDirectoryName', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  const exportDirectoryName1 = 'TEST__machine_SCAN-0001__2023-08-16_17-02-24';
  const exportDirectoryName2 = 'TEST__machine_SCAN-0001__2023-08-16_23-10-01';

  expect(store.getExportDirectoryName()).toEqual(undefined);

  store.setExportDirectoryName(exportDirectoryName1);
  expect(store.getExportDirectoryName()).toEqual(exportDirectoryName1);

  store.setExportDirectoryName(exportDirectoryName2);
  expect(store.getExportDirectoryName()).toEqual(exportDirectoryName2);

  store.setExportDirectoryName(undefined);
  expect(store.getExportDirectoryName()).toEqual(undefined);
});

test(
  'getPendingContinuousExportOperations, addPendingContinuousExportOperation, ' +
    'deletePendingContinuousExportOperation, and deleteAllPendingContinuousExportOperations',
  () => {
    const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

    expect(store.getPendingContinuousExportOperations()).toEqual([]);

    store.addPendingContinuousExportOperation(
      'abcd1234-0000-0000-0000-000000000000'
    );
    expect(store.getPendingContinuousExportOperations()).toEqual([
      'abcd1234-0000-0000-0000-000000000000',
    ]);

    store.addPendingContinuousExportOperation(
      'abcd2345-0000-0000-0000-000000000000'
    );
    store.addPendingContinuousExportOperation(
      'abcd3456-0000-0000-0000-000000000000'
    );
    expect(store.getPendingContinuousExportOperations()).toEqual([
      'abcd1234-0000-0000-0000-000000000000',
      'abcd2345-0000-0000-0000-000000000000',
      'abcd3456-0000-0000-0000-000000000000',
    ]);

    // Add a record that's already been added
    store.addPendingContinuousExportOperation(
      'abcd1234-0000-0000-0000-000000000000'
    );
    expect(store.getPendingContinuousExportOperations()).toEqual([
      'abcd2345-0000-0000-0000-000000000000',
      'abcd3456-0000-0000-0000-000000000000',
      'abcd1234-0000-0000-0000-000000000000',
    ]);

    store.deletePendingContinuousExportOperation(
      'abcd1234-0000-0000-0000-000000000000'
    );
    expect(store.getPendingContinuousExportOperations()).toEqual([
      'abcd2345-0000-0000-0000-000000000000',
      'abcd3456-0000-0000-0000-000000000000',
    ]);

    // Delete a non-existent record
    store.deletePendingContinuousExportOperation(
      'abcd4567-0000-0000-0000-000000000000'
    );
    expect(store.getPendingContinuousExportOperations()).toEqual([
      'abcd2345-0000-0000-0000-000000000000',
      'abcd3456-0000-0000-0000-000000000000',
    ]);

    store.deleteAllPendingContinuousExportOperations();
    expect(store.getPendingContinuousExportOperations()).toEqual([]);
  }
);

test('forEachSheetPendingContinuousExport', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  const batchId = store.addBatch();

  const sheet1Id = uuid();
  store.addSheet(sheet1Id, batchId, [
    { ...testSheetWithFiles[0], imagePath: '1-front.jpg' },
    { ...testSheetWithFiles[1], imagePath: '1-back.jpg' },
  ]);

  const sheet2Id = uuid();
  store.addSheet(sheet2Id, batchId, [
    { ...testSheetWithFiles[0], imagePath: '2-front.jpg' },
    { ...testSheetWithFiles[1], imagePath: '2-back.jpg' },
  ]);
  const expectedSheet2: AcceptedSheet = {
    type: 'accepted',
    id: sheet2Id,
    batchId,
    interpretation: mapSheet(testSheetWithFiles, (page) => page.interpretation),
    frontImagePath: '2-front.jpg',
    backImagePath: '2-back.jpg',
  };

  const sheet3Id = uuid();
  store.addSheet(sheet3Id, batchId, [
    { ...testSheetWithFiles[0], imagePath: '3-front.jpg' },
    { ...testSheetWithFiles[1], imagePath: '3-back.jpg' },
  ]);
  const expectedSheet3: AcceptedSheet = {
    type: 'accepted',
    id: sheet3Id,
    batchId,
    interpretation: mapSheet(testSheetWithFiles, (page) => page.interpretation),
    frontImagePath: '3-front.jpg',
    backImagePath: '3-back.jpg',
  };

  store.addPendingContinuousExportOperation(sheet2Id);
  store.addPendingContinuousExportOperation(sheet3Id);

  expect(Array.from(store.forEachSheetPendingContinuousExport())).toEqual(
    sortSheets([expectedSheet2, expectedSheet3])
  );

  store.deletePendingContinuousExportOperation(sheet2Id);
  expect(Array.from(store.forEachSheetPendingContinuousExport())).toEqual([
    expectedSheet3,
  ]);

  store.deletePendingContinuousExportOperation(sheet3Id);
  expect(Array.from(store.forEachSheetPendingContinuousExport())).toEqual([]);
});

test('getCastVoteRecordRootHash, updateCastVoteRecordHashes, and clearCastVoteRecordHashes', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

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

test('getElectricalTestingStatusMessages and setElectricalTestingStatusMessage', () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));

  expect(store.getElectricalTestingStatusMessages()).toEqual([]);

  store.setElectricalTestingStatusMessage('card', 'Success');
  expect(store.getElectricalTestingStatusMessages()).toEqual([
    {
      component: 'card',
      statusMessage: 'Success',
      updatedAt: expect.any(DateTime),
    },
  ]);

  store.setElectricalTestingStatusMessage('usbDrive', 'Success');
  expect(store.getElectricalTestingStatusMessages()).toEqual([
    {
      component: 'card',
      statusMessage: 'Success',
      updatedAt: expect.any(DateTime),
    },
    {
      component: 'usbDrive',
      statusMessage: 'Success',
      updatedAt: expect.any(DateTime),
    },
  ]);

  store.setElectricalTestingStatusMessage('card', 'Error: No card');
  expect(store.getElectricalTestingStatusMessages()).toEqual([
    {
      component: 'card',
      statusMessage: 'Error: No card',
      updatedAt: expect.any(DateTime),
    },
    {
      component: 'usbDrive',
      statusMessage: 'Success',
      updatedAt: expect.any(DateTime),
    },
  ]);
});
