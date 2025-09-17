/* eslint-disable vx/no-expect-to-be */
import { vi, expect, test } from 'vitest';
import { v4 as uuid } from 'uuid';
import { mockBaseLogger } from '@votingworks/logging';
import { electionGridLayoutNewHampshireTestBallotFixtures } from '@votingworks/fixtures';
import {
  BallotMetadata,
  BallotStyleId,
  BallotType,
  PageInterpretationWithFiles,
  SheetOf,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { Store } from '../store';
import { getScannerResultsMemoized } from './results';

const jurisdiction = TEST_JURISDICTION;
const electionPackageHash = 'test-election-package-hash';

const testMetadata: BallotMetadata = {
  ballotStyleId: 'card-number-3' as BallotStyleId,
  ballotType: BallotType.Precinct,
  ballotHash:
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
      .ballotHash,
  isTestMode: false,
  precinctId: 'town-id-00701-precinct-id-default',
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

test('getScannerResultsMemoized correctly memoizes results based on ballot count', async () => {
  const store = Store.memoryStore(mockBaseLogger({ fn: vi.fn }));
  store.setElectionAndJurisdiction({
    electionData:
      electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition()
        .electionData,
    jurisdiction,
    electionPackageHash,
  });

  const zeroResultsA = await getScannerResultsMemoized({ store });
  expect(store.getBallotsCounted()).toEqual(0);
  expect(zeroResultsA).toHaveLength(1);
  expect(zeroResultsA[0].cardCounts.hmpb[0]).toBeUndefined();

  const zeroResultsB = await getScannerResultsMemoized({ store });
  expect(zeroResultsB).toBe(zeroResultsA); // should be exact same object due to memoization

  // Add a ballot to the store
  const batchId1 = store.addBatch();
  const sheetId1 = uuid();
  store.addSheet(sheetId1, batchId1, testSheetWithFiles);
  store.finishBatch({ batchId: batchId1 });

  expect(store.getBallotsCounted()).toEqual(1);

  // Call getScannerResultsMemoized again - should return new results due to changed ballot count
  const oneResultsA = await getScannerResultsMemoized({ store });
  expect(oneResultsA).not.toBe(zeroResultsA); // Should be a different object reference
  expect(oneResultsA).toHaveLength(1); // Should have one group of results
  expect(oneResultsA[0].cardCounts.hmpb[0]).toEqual(1);

  const oneResultsB = await getScannerResultsMemoized({
    store,
  });
  expect(oneResultsB).toBe(oneResultsA); // should be exact same object due to memoization

  const batchId2 = store.addBatch();
  const sheetId2 = uuid();
  const testSheetWithFiles2: SheetOf<PageInterpretationWithFiles> = [
    {
      ...testSheetWithFiles[0],
      imagePath: '/front2.png',
    },
    {
      ...testSheetWithFiles[1],
      imagePath: '/back2.png',
    },
  ];
  store.addSheet(sheetId2, batchId2, testSheetWithFiles2);
  store.finishBatch({ batchId: batchId2 });

  expect(store.getBallotsCounted()).toEqual(2);

  const twoResultsA = await getScannerResultsMemoized({ store });
  expect(twoResultsA).not.toBe(oneResultsA);
  expect(twoResultsA).toHaveLength(1);
  expect(twoResultsA[0].cardCounts.hmpb[0]).toEqual(2);

  const twoResultsB = await getScannerResultsMemoized({
    store,
  });
  expect(twoResultsB).toBe(twoResultsA); // should be exact same object due to memoization
});
