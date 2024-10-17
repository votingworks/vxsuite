import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import {
  AdjudicationReason,
  BallotMetadata,
  BallotStyleId,
  BallotType,
  BatchInfo,
  DEFAULT_SYSTEM_SETTINGS,
  InterpretedHmpbPage,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { mockElectionManagerAuth } from '../test/helpers/auth';
import { generateBmdBallotFixture } from '../test/helpers/ballots';
import { withApp } from '../test/helpers/setup_app';
import { ScannedSheetInfo } from './fujitsu_scanner';

const jurisdiction = TEST_JURISDICTION;

test('scanBatch with multiple sheets', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const ballot = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    frontPath: ballot[0],
    backPath: ballot[1],
  };
  await withApp(async ({ auth, apiClient, scanner, importer, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });

    scanner
      .withNextScannerSession()
      .sheet(scannedBallot)
      .sheet(scannedBallot)
      .sheet(scannedBallot)
      .end();

    await apiClient.scanBatch();
    await importer.waitForEndOfBatchOrScanningPause();

    const status = await apiClient.getStatus();
    expect(status.adjudicationsRemaining).toEqual(0);
    expect(status.canUnconfigure).toEqual(true);
    expect(status.batches.length).toEqual(1);
    expect(status.batches[0]).toEqual<BatchInfo>({
      id: expect.any(String),
      batchNumber: 1,
      label: 'Batch 1',
      count: 3,
      startedAt: expect.any(String),
      endedAt: expect.any(String),
    });
  });
});

test('get next sheet', async () => {
  await withApp(async ({ workspace, apiClient }) => {
    jest
      .spyOn(workspace.store, 'getNextAdjudicationSheet')
      .mockReturnValueOnce({
        id: 'mock-review-sheet',
        front: {
          image: { url: '/url/front' },
          interpretation: { type: 'BlankPage' },
        },
        back: {
          image: { url: '/url/back' },
          interpretation: { type: 'BlankPage' },
        },
      });

    expect(await apiClient.getNextSheetToReview()).toEqual<
      Awaited<ReturnType<typeof apiClient.getNextSheetToReview>>
    >({
      interpreted: {
        id: 'mock-review-sheet',
        front: {
          image: { url: '/url/front' },
          interpretation: { type: 'BlankPage' },
        },
        back: {
          image: { url: '/url/back' },
          interpretation: { type: 'BlankPage' },
        },
      },
      layouts: {},
      definitions: {},
    });
  });
});

test('get next sheet layouts', async () => {
  const metadata: BallotMetadata = {
    ballotHash:
      electionGridLayoutNewHampshireTestBallotFixtures.electionDefinition
        .ballotHash,
    ballotType: BallotType.Precinct,
    ballotStyleId: 'card-number-3' as BallotStyleId,
    precinctId: 'town-id-00701-precinct-id-default',
    isTestMode: false,
  };
  const frontInterpretation: InterpretedHmpbPage = {
    type: 'InterpretedHmpbPage',
    metadata: {
      ...metadata,
      pageNumber: 1,
    },
    markInfo: {
      ballotSize: { width: 1, height: 1 },
      marks: [],
    },
    adjudicationInfo: {
      requiresAdjudication: true,
      enabledReasons: [AdjudicationReason.Overvote],
      enabledReasonInfos: [
        {
          type: AdjudicationReason.Overvote,
          contestId: 'contest-id',
          expected: 1,
          optionIds: ['option-id', 'option-id-2'],
        },
      ],
      ignoredReasonInfos: [],
    },
    votes: {},
    layout: {
      pageSize: { width: 1, height: 1 },
      metadata: {
        ...metadata,
        pageNumber: 1,
      },
      contests: [],
    },
  };
  const backInterpretation: InterpretedHmpbPage = {
    ...frontInterpretation,
    metadata: {
      ...frontInterpretation.metadata,
      pageNumber: 2,
    },
  };
  await withApp(async ({ apiClient, workspace }) => {
    jest
      .spyOn(workspace.store, 'getNextAdjudicationSheet')
      .mockReturnValueOnce({
        id: 'mock-review-sheet',
        front: {
          image: { url: '/url/front' },
          interpretation: frontInterpretation,
        },
        back: {
          image: { url: '/url/back' },
          interpretation: backInterpretation,
        },
      });

    expect(await apiClient.getNextSheetToReview()).toEqual<
      Awaited<ReturnType<typeof apiClient.getNextSheetToReview>>
    >({
      interpreted: {
        id: 'mock-review-sheet',
        front: {
          image: { url: '/url/front' },
          interpretation: frontInterpretation,
        },
        back: {
          image: { url: '/url/back' },
          interpretation: backInterpretation,
        },
      },
      layouts: {
        front: frontInterpretation.layout,
        back: backInterpretation.layout,
      },
      definitions: {
        front: { contestIds: expect.any(Array) },
        back: { contestIds: expect.any(Array) },
      },
    });
  });
});

test('continueScanning after invalid ballot', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  const ballot = await generateBmdBallotFixture();
  await withApp(async ({ auth, apiClient, scanner, importer, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });

    scanner
      .withNextScannerSession()
      .sheet({
        frontPath: ballot[0],
        backPath: ballot[1],
      })
      // Invalid BMD ballot
      .sheet({ frontPath: ballot[1], backPath: ballot[1] })
      .sheet({ frontPath: ballot[0], backPath: ballot[1] })
      .end();

    await apiClient.scanBatch();
    await importer.waitForEndOfBatchOrScanningPause();
    {
      const status = await apiClient.getStatus();
      expect(status.adjudicationsRemaining).toEqual(1);
      expect(status.canUnconfigure).toEqual(true);
      expect(status.batches.length).toEqual(1);
      expect(status.batches[0]).toEqual<BatchInfo>({
        id: expect.any(String),
        batchNumber: 1,
        label: 'Batch 1',
        count: 2,
        startedAt: expect.any(String),
        endedAt: undefined, // not ended
      });
    }
    await apiClient.continueScanning({ forceAccept: false });
    await importer.waitForEndOfBatchOrScanningPause();
    {
      const status = await apiClient.getStatus();
      expect(status.adjudicationsRemaining).toEqual(0);
      expect(status.canUnconfigure).toEqual(true);
      expect(status.batches.length).toEqual(1);
      expect(status.batches[0]).toEqual<BatchInfo>({
        id: expect.any(String),
        batchNumber: 1,
        label: 'Batch 1',
        count: 2, // bad ballot removed
        startedAt: expect.any(String),
        endedAt: expect.any(String),
      });
    }
  });
});
