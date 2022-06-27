import {
  AdjudicationReason,
  BallotMetadata,
  BallotPageLayout,
  BallotPageMetadata,
  BallotType,
  CandidateContest,
  PageInterpretationWithFiles,
  YesNoContest,
} from '@votingworks/types';
import { sleep, typedAs } from '@votingworks/utils';
import { Buffer } from 'buffer';
import { writeFile } from 'fs-extra';
import * as streams from 'memory-streams';
import * as tmp from 'tmp';
import { v4 as uuid } from 'uuid';
import * as stateOfHamilton from '../test/fixtures/state-of-hamilton';
import { zeroRect } from '../test/fixtures/zero_rect';
import { Store } from './store';
import { SheetOf } from './types';

// We pause in some of these tests so we need to increase the timeout
jest.setTimeout(20000);

test('get/set election', () => {
  const store = Store.memoryStore();

  expect(store.getElectionDefinition()).toBeUndefined();

  store.setElection(stateOfHamilton.electionDefinition);
  expect(store.getElectionDefinition()?.election).toEqual(
    stateOfHamilton.election
  );

  store.setElection(undefined);
  expect(store.getElectionDefinition()).toBeUndefined();
});

test('get/set test mode', () => {
  const store = Store.memoryStore();

  expect(store.getTestMode()).toBe(true);

  store.setTestMode(false);
  expect(store.getTestMode()).toBe(false);

  store.setTestMode(true);
  expect(store.getTestMode()).toBe(true);
});

test('get/set mark threshold overrides', () => {
  const store = Store.memoryStore();

  expect(store.getMarkThresholdOverrides()).toBe(undefined);

  store.setMarkThresholdOverrides({ definite: 0.6, marginal: 0.5 });
  expect(store.getMarkThresholdOverrides()).toStrictEqual({
    definite: 0.6,
    marginal: 0.5,
  });

  store.setMarkThresholdOverrides(undefined);
  expect(store.getMarkThresholdOverrides()).toBe(undefined);
});

test('get current mark thresholds falls back to election definition defaults', () => {
  const store = Store.memoryStore();
  store.setElection(stateOfHamilton.electionDefinition);
  expect(store.getCurrentMarkThresholds()).toStrictEqual({
    definite: 0.17,
    marginal: 0.12,
  });

  store.setMarkThresholdOverrides({ definite: 0.6, marginal: 0.5 });
  expect(store.getCurrentMarkThresholds()).toStrictEqual({
    definite: 0.6,
    marginal: 0.5,
  });

  store.setMarkThresholdOverrides(undefined);
  expect(store.getCurrentMarkThresholds()).toStrictEqual({
    definite: 0.17,
    marginal: 0.12,
  });
});

test('HMPB template handling', () => {
  const store = Store.memoryStore();
  const metadata: BallotMetadata = {
    electionHash: 'd34db33f',
    locales: { primary: 'en-US' },
    ballotStyleId: '12',
    precinctId: '23',
    isTestMode: false,
    ballotType: BallotType.Standard,
  };

  expect(store.getHmpbTemplates()).toEqual([]);

  store.addHmpbTemplate(Buffer.of(1, 2, 3), metadata, [
    {
      pageSize: { width: 1, height: 1 },
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      contests: [],
    },
    {
      pageSize: { width: 1, height: 1 },
      metadata: {
        ...metadata,
        pageNumber: 2,
      },
      contests: [],
    },
  ]);

  expect(store.getHmpbTemplates()).toEqual(
    typedAs<Array<[Buffer, BallotPageLayout[]]>>([
      [
        Buffer.of(1, 2, 3),
        [
          {
            pageSize: { width: 1, height: 1 },
            metadata: {
              electionHash: 'd34db33f',
              ballotType: BallotType.Standard,
              locales: { primary: 'en-US' },
              ballotStyleId: '12',
              precinctId: '23',
              isTestMode: false,
              pageNumber: 1,
            },
            contests: [],
          },
          {
            pageSize: { width: 1, height: 1 },
            metadata: {
              electionHash: 'd34db33f',
              ballotType: BallotType.Standard,
              locales: { primary: 'en-US' },
              ballotStyleId: '12',
              precinctId: '23',
              isTestMode: false,
              pageNumber: 2,
            },
            contests: [],
          },
        ],
      ],
    ])
  );
});

test('batch cleanup works correctly', () => {
  const dbFile = tmp.fileSync();
  const store = Store.fileStore(dbFile.name);

  store.reset();

  const firstBatchId = store.addBatch();
  store.addBatch();
  store.finishBatch({ batchId: firstBatchId });
  store.cleanupIncompleteBatches();

  const batches = store.batchStatus();
  expect(batches).toHaveLength(1);
  expect(batches[0].id).toEqual(firstBatchId);
  expect(batches[0].label).toEqual('Batch 1');

  const thirdBatchId = store.addBatch();
  store.addBatch();
  store.finishBatch({ batchId: thirdBatchId });
  store.cleanupIncompleteBatches();
  const updatedBatches = store.batchStatus();
  expect(
    [...updatedBatches].sort((a, b) => a.label.localeCompare(b.label))
  ).toEqual([
    expect.objectContaining({
      id: firstBatchId,
      label: 'Batch 1',
    }),
    expect.objectContaining({
      id: thirdBatchId,
      label: 'Batch 3',
    }),
  ]);
});

test('batchStatus', () => {
  const store = Store.memoryStore();

  const frontMetadata: BallotPageMetadata = {
    locales: { primary: 'en-US' },
    electionHash: '',
    ballotType: BallotType.Standard,
    ballotStyleId: stateOfHamilton.election.ballotStyles[0].id,
    precinctId: stateOfHamilton.election.precincts[0].id,
    isTestMode: false,
    pageNumber: 1,
  };
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    pageNumber: 2,
  };

  // Create a batch and add a sheet to it
  const batchId = store.addBatch();
  const sheetId = store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page.png',
      normalizedFilename: '/tmp/front-normalized-page.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: frontMetadata,
      },
    },
    {
      originalFilename: '/tmp/back-page.png',
      normalizedFilename: '/tmp/back-normalized-page.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: backMetadata,
      },
    },
  ]);

  // Add a second sheet
  const sheetId2 = store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page2.png',
      normalizedFilename: '/tmp/front-normalized-page2.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: frontMetadata,
      },
    },
    {
      originalFilename: '/tmp/back-page2.png',
      normalizedFilename: '/tmp/back-normalized-page2.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: backMetadata,
      },
    },
  ]);
  let batches = store.batchStatus();
  expect(batches).toHaveLength(1);
  expect(batches[0].count).toEqual(2);

  // Delete one of the sheets
  store.deleteSheet(sheetId);
  batches = store.batchStatus();
  expect(batches).toHaveLength(1);
  expect(batches[0].count).toEqual(1);

  // Delete the last sheet, then confirm that store.batchStatus() results still include the batch
  store.deleteSheet(sheetId2);
  batches = store.batchStatus();
  expect(batches).toHaveLength(1);
  expect(batches[0].count).toEqual(0);

  // Confirm that batches marked as deleted are not included
  store.deleteBatch(batchId);
  batches = store.batchStatus();
  expect(batches).toHaveLength(0);
});

test('canUnconfigure in test mode', () => {
  const store = Store.memoryStore();
  store.setTestMode(true);

  // With an unexported batch, we should be able to unconfigure the machine in test mode
  store.addBatch();
  expect(store.getCanUnconfigure()).toBe(true);
});

test('canUnconfigure not in test mode', async () => {
  const store = Store.memoryStore();
  store.setTestMode(false);

  const frontMetadata: BallotPageMetadata = {
    locales: { primary: 'en-US' },
    electionHash: '',
    ballotType: BallotType.Standard,
    ballotStyleId: stateOfHamilton.election.ballotStyles[0].id,
    precinctId: stateOfHamilton.election.precincts[0].id,
    isTestMode: false,
    pageNumber: 1,
  };
  const backMetadata: BallotPageMetadata = {
    ...frontMetadata,
    pageNumber: 2,
  };

  // Create a batch
  const batchId = store.addBatch();

  // Pause so timestamps are not equal
  await sleep(1000);
  store.setBatchesAsBackedUp();
  store.setCvrsAsBackedUp();
  expect(store.getCanUnconfigure()).toBe(true);

  await sleep(1000);
  // Add a sheet to the batch and confirm that invalidates the backup/export
  const sheetId = store.addSheet(uuid(), batchId, [
    {
      originalFilename: '/tmp/front-page.png',
      normalizedFilename: '/tmp/front-normalized-page.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: frontMetadata,
      },
    },
    {
      originalFilename: '/tmp/back-page.png',
      normalizedFilename: '/tmp/back-normalized-page.png',
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: backMetadata,
      },
    },
  ]);
  expect(store.getCanUnconfigure()).toBe(false);

  await sleep(1000);
  store.setBatchesAsBackedUp();
  store.setCvrsAsBackedUp();
  expect(store.getCanUnconfigure()).toBe(true);

  // Delete the sheet, confirm that invalidates the backup/export
  await sleep(1000);
  store.deleteSheet(sheetId);
  expect(store.getCanUnconfigure()).toBe(false);

  // Add another batch, then mark as exported
  const batchId2 = store.addBatch();
  // Pause before marking as exported so timestamps are not equal
  await sleep(1000);
  store.setBatchesAsBackedUp();
  store.setCvrsAsBackedUp();
  expect(store.getCanUnconfigure()).toBe(true);

  // Delete the second batch, confirm that invalidates the backup/export
  await sleep(1000);
  store.deleteBatch(batchId2);
  expect(store.getCanUnconfigure()).toBe(false);
});

test('adjudication', () => {
  const candidateContests = stateOfHamilton.election.contests.filter(
    (contest): contest is CandidateContest => contest.type === 'candidate'
  );
  const yesnoContests = stateOfHamilton.election.contests.filter(
    (contest): contest is YesNoContest => contest.type === 'yesno'
  );
  const yesnoOption = 'yes';

  const store = Store.memoryStore();
  const metadata: BallotMetadata = {
    electionHash: stateOfHamilton.electionDefinition.electionHash,
    ballotStyleId: '12',
    precinctId: '23',
    isTestMode: false,
    locales: { primary: 'en-US' },
    ballotType: BallotType.Standard,
  };
  store.setElection(stateOfHamilton.electionDefinition);
  store.addHmpbTemplate(
    Buffer.of(),
    metadata,
    [1, 2].map((pageNumber) => ({
      pageSize: { width: 1, height: 1 },
      metadata: {
        ...metadata,
        pageNumber,
      },
      contests: [
        {
          bounds: zeroRect,
          corners: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
          options: [
            {
              bounds: zeroRect,
              target: {
                bounds: zeroRect,
                inner: zeroRect,
              },
            },
          ],
        },
        {
          bounds: zeroRect,
          corners: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
          options: [
            {
              bounds: zeroRect,
              target: {
                bounds: zeroRect,
                inner: zeroRect,
              },
            },
          ],
        },
      ],
    }))
  );
  const batchId = store.addBatch();
  const ballotId = store.addSheet(
    uuid(),
    batchId,
    [0, 1].map((i) =>
      typedAs<PageInterpretationWithFiles>({
        originalFilename:
          i === 0 ? '/front-original.png' : '/back-original.png',
        normalizedFilename:
          i === 0 ? '/front-normalized.png' : '/back-normalized.png',
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
                score: 0.12, // marginal
                scoredOffset: { x: 0, y: 0 },
                bounds: zeroRect,
                target: {
                  bounds: zeroRect,
                  inner: zeroRect,
                },
              },
              {
                type: 'yesno',
                contestId: yesnoContests[i].id,
                optionId: yesnoOption,
                score: 1, // definite
                scoredOffset: { x: 0, y: 0 },
                bounds: zeroRect,
                target: {
                  bounds: zeroRect,
                  inner: zeroRect,
                },
              },
            ],
          },
          metadata: {
            electionHash: stateOfHamilton.electionDefinition.electionHash,
            ballotStyleId: '12',
            precinctId: '23',
            isTestMode: false,
            pageNumber: 1,
            locales: { primary: 'en-US' },
            ballotType: BallotType.Standard,
          },
          adjudicationInfo: {
            requiresAdjudication: true,
            enabledReasons: [
              AdjudicationReason.UninterpretableBallot,
              AdjudicationReason.MarginalMark,
            ],
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
        },
      })
    ) as SheetOf<PageInterpretationWithFiles>
  );

  // check the review paths
  const reviewSheet = store.getNextAdjudicationSheet();
  expect(reviewSheet?.id).toEqual(ballotId);

  store.finishBatch({ batchId });

  // cleaning up batches now should have no impact
  store.cleanupIncompleteBatches();
});

test('exportCvrs', async () => {
  const store = Store.memoryStore();
  store.setElection(stateOfHamilton.electionDefinition);

  // No CVRs, export should be empty
  let stream = new streams.WritableStream();
  store.exportCvrs(stream);
  expect(stream.toString()).toEqual('');

  const metadata: BallotPageMetadata = {
    locales: { primary: 'en-US' },
    electionHash: stateOfHamilton.electionDefinition.electionHash,
    ballotType: BallotType.Standard,
    ballotStyleId: stateOfHamilton.election.ballotStyles[0].id,
    precinctId: stateOfHamilton.election.precincts[0].id,
    isTestMode: false,
    pageNumber: 1,
  };

  store.addHmpbTemplate(Buffer.of(1, 2, 3), metadata, [
    {
      pageSize: { width: 1, height: 1 },
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      contests: [],
    },
    {
      pageSize: { width: 1, height: 1 },
      metadata: {
        ...metadata,
        pageNumber: 2,
      },
      contests: [],
    },
  ]);

  const frontOriginalFile = tmp.fileSync();
  await writeFile(frontOriginalFile.fd, 'front original');

  const frontNormalizedFile = tmp.fileSync();
  await writeFile(frontNormalizedFile.fd, 'front normalized');

  const backOriginalFile = tmp.fileSync();
  await writeFile(backOriginalFile.fd, 'back original');

  const backNormalizedFile = tmp.fileSync();
  await writeFile(backNormalizedFile.fd, 'back normalized');

  // Create CVRs, confirm that they are exported should work
  const batchId = store.addBatch();
  const sheetId = store.addSheet(uuid(), batchId, [
    {
      originalFilename: frontOriginalFile.name,
      normalizedFilename: frontNormalizedFile.name,
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 1,
        },
      },
    },
    {
      originalFilename: backOriginalFile.name,
      normalizedFilename: backNormalizedFile.name,
      interpretation: {
        type: 'UninterpretedHmpbPage',
        metadata: {
          ...metadata,
          pageNumber: 2,
        },
      },
    },
  ]);
  store.adjudicateSheet(sheetId, 'front', []);
  store.adjudicateSheet(sheetId, 'back', []);

  stream = new streams.WritableStream();
  store.exportCvrs(stream);
  expect(stream.toString()).toEqual(
    expect.stringContaining(stateOfHamilton.election.precincts[0].id)
  );
  expect(stream.toString()).toEqual(
    expect.stringContaining('front normalized')
  );

  // Confirm that deleted batches are not included in exported CVRs
  stream = new streams.WritableStream();
  store.deleteBatch(batchId);
  store.exportCvrs(stream);
  expect(stream.toString()).toEqual('');
});
