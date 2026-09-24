import { assertDefined, deferred, iter } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryPath,
} from '@votingworks/fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import {
  AdjudicationReason,
  asSheet,
  BatchInfo,
  DEFAULT_SYSTEM_SETTINGS,
  PageInterpretation,
  TEST_JURISDICTION,
} from '@votingworks/types';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { LogEventId, Logger } from '@votingworks/logging';
import { readFile } from 'node:fs/promises';
import { beforeEach, expect, test, vi } from 'vitest';
import { mockElectionManagerAuth } from '../test/helpers/auth.js';
import { generateBmdBallotFixture } from '../test/helpers/ballots.js';
import { waitForStatus, withApp } from '../test/helpers/setup_app.js';
import { ScannedSheetInfo } from './fujitsu_scanner.js';

const jurisdiction = TEST_JURISDICTION;

const ANY_BALLOT_IMAGE = {
  imageUrl: expect.stringMatching(/^data:image\//),
  ballotBounds: {
    x: 0,
    y: 0,
    width: expect.any(Number),
    height: expect.any(Number),
  },
} as const;

vi.setConfig({ testTimeout: 20000 });

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  featureFlagMock.resetFeatureFlags();
});

function hasLoggedMachineEvent(logger: Logger, eventType: string): boolean {
  return vi
    .mocked(logger.log)
    .mock.calls.some(
      ([eventId, , logData]) =>
        eventId === LogEventId.ScannerEvent &&
        logData?.message === `Event: ${eventType}`
    );
}

test('scanBatch with multiple sheets', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    frontPath: bmdFixture.sheet[0],
    backPath: bmdFixture.sheet[1],
  };
  await withApp(async ({ auth, apiClient, scanner, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    // The scanned ballot is for precinct '23', which is covered by
    // '23-polling-place', so all sheets are accepted.
    await apiClient.setPollingPlaceId({ id: '23-polling-place' });

    scanner
      .withNextScannerSession()
      .sheet(scannedBallot)
      .sheet(scannedBallot)
      .sheet(scannedBallot)
      .end();

    await apiClient.scanBatch();
    const pausedStatus = await waitForStatus(apiClient, {
      state: 'paused',
      pauseReason: { type: 'tray-empty' },
    });
    expect(pausedStatus.batches[0]).toEqual<BatchInfo>({
      id: expect.any(String),
      batchNumber: 1,
      label: 'Batch 1',
      count: 3,
      startedAt: expect.any(String),
      endedAt: undefined,
      pollingPlaceId: '23-polling-place',
    });

    await apiClient.saveBatch();
    const status = await apiClient.getStatus();
    expect(status.state).toEqual('idle');
    expect(status.canUnconfigure).toEqual(true);
    expect(status.batches.length).toEqual(1);
    expect(status.batches[0]).toEqual<BatchInfo>({
      id: expect.any(String),
      batchNumber: 1,
      label: 'Batch 1',
      count: 3,
      startedAt: expect.any(String),
      endedAt: expect.any(String),
      pollingPlaceId: '23-polling-place',
    });
  });
});

test('pausing while a sheet is staged scans it first; resuming continues the batch', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    frontPath: bmdFixture.sheet[0],
    backPath: bmdFixture.sheet[1],
  };
  await withApp(async ({ auth, apiClient, scanner, workspace, logger }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: '23-polling-place' });

    const thirdSheetStaged = deferred<void>();
    const scannerHoldingThirdSheet = deferred<void>();
    scanner
      .withNextScannerSession()
      .sheet(scannedBallot)
      .sheet(scannedBallot)
      .waitFor(thirdSheetStaged.promise, () =>
        scannerHoldingThirdSheet.resolve()
      )
      .sheet(scannedBallot)
      .end();

    await apiClient.scanBatch();
    await scannerHoldingThirdSheet.promise;
    expect((await apiClient.getStatus()).batches[0].count).toEqual(2);

    const pausing = apiClient.pauseBatch();
    await vi.waitFor(() => {
      expect(hasLoggedMachineEvent(logger, 'PAUSE_BATCH')).toEqual(true);
    });
    expect((await apiClient.getStatus()).state).toEqual('scanning');

    thirdSheetStaged.resolve();
    await pausing;
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScannerEvent,
      'election_manager',
      expect.objectContaining({ message: 'Event: PAUSE_BATCH' })
    );
    const pausedStatus = await apiClient.getStatus();
    expect(pausedStatus).toMatchObject({
      state: 'paused',
      pauseReason: { type: 'manual' },
    });
    expect(pausedStatus.batches[0].count).toEqual(3);

    scanner.withNextScannerSession().end();
    await apiClient.resumeBatch();
    await waitForStatus(apiClient, {
      state: 'paused',
      pauseReason: { type: 'tray-empty' },
    });

    scanner.withNextScannerSession().sheet(scannedBallot).end();
    await apiClient.resumeBatch();
    const reloadedStatus = await waitForStatus(apiClient, {
      state: 'paused',
      pauseReason: { type: 'tray-empty' },
    });
    expect(reloadedStatus.batches[0].count).toEqual(4);

    await apiClient.saveBatch();
    const status = await apiClient.getStatus();
    expect(status.state).toEqual('idle');
    expect(status.batches[0]).toEqual(
      expect.objectContaining({ count: 4, endedAt: expect.any(String) })
    );
  });
});

test('pausing while the batch is starting pauses after the first sheet', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    frontPath: bmdFixture.sheet[0],
    backPath: bmdFixture.sheet[1],
  };
  await withApp(async ({ auth, apiClient, scanner, workspace, logger }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: '23-polling-place' });

    const imprinterCheck = deferred<boolean>();
    vi.spyOn(scanner, 'isImprinterAttached').mockReturnValueOnce(
      imprinterCheck.promise
    );
    scanner
      .withNextScannerSession()
      .sheet(scannedBallot)
      .sheet(scannedBallot)
      .end();

    const starting = apiClient.scanBatch();
    await waitForStatus(apiClient, { state: 'scanning' });
    const pausing = apiClient.pauseBatch();
    await vi.waitFor(() => {
      expect(hasLoggedMachineEvent(logger, 'PAUSE_BATCH')).toEqual(true);
    });

    imprinterCheck.resolve(false);
    await Promise.all([starting, pausing]);
    const status = await apiClient.getStatus();
    expect(status).toMatchObject({
      state: 'paused',
      pauseReason: { type: 'manual' },
    });
    expect(status.batches[0].count).toEqual(1);
  });
});

test('pausing while a sheet is being interpreted pauses after it', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    frontPath: bmdFixture.sheet[0],
    backPath: bmdFixture.sheet[1],
  };
  await withApp(async ({ auth, apiClient, scanner, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: '23-polling-place' });

    let pausing: Promise<void> | undefined;
    scanner
      .withNextScannerSession()
      .sheet(scannedBallot, () => {
        setImmediate(() => {
          pausing = apiClient.pauseBatch();
        });
      })
      .sheet(scannedBallot)
      .end();

    await apiClient.scanBatch();
    await vi.waitFor(() => expect(pausing).toBeDefined());
    await assertDefined(pausing);
    const status = await apiClient.getStatus();
    expect(status).toMatchObject({
      state: 'paused',
      pauseReason: { type: 'manual' },
    });
    expect(status.batches[0].count).toEqual(1);
  });
});

test('pausing while a sheet that needs review is being interpreted stops for review', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  await withApp(async ({ auth, apiClient, scanner, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: 'central-scanning' });

    let pausing: Promise<void> | undefined;
    scanner
      .withNextScannerSession()
      .sheet(
        { frontPath: bmdFixture.sheet[1], backPath: bmdFixture.sheet[1] },
        () => {
          setImmediate(() => {
            pausing = apiClient.pauseBatch();
          });
        }
      )
      .end();

    await apiClient.scanBatch();
    await vi.waitFor(() => expect(pausing).toBeDefined());
    await assertDefined(pausing);
    const { sheetId } = await waitForStatus(apiClient, {
      state: 'needsReview',
    });

    await apiClient.acceptSheet();
    expect(await apiClient.getStatus()).toMatchObject({
      state: 'paused',
      pauseReason: { type: 'review', sheetId },
    });
  });
});

test('discardBatch deletes the paused batch', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    frontPath: bmdFixture.sheet[0],
    backPath: bmdFixture.sheet[1],
  };
  await withApp(async ({ auth, apiClient, scanner, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: '23-polling-place' });

    scanner.withNextScannerSession().sheet(scannedBallot).end();
    await apiClient.scanBatch();
    const pausedStatus = await waitForStatus(apiClient, {
      state: 'paused',
      pauseReason: { type: 'tray-empty' },
    });
    expect(pausedStatus.batches[0].count).toEqual(1);

    await apiClient.discardBatch();
    const status = await apiClient.getStatus();
    expect(status.state).toEqual('idle');
    expect(status.batches).toEqual([]);
    expect(workspace.store.getBallotsCounted()).toEqual(0);
  });
});

test('rejectSheet after invalid ballot', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  await withApp(async ({ auth, apiClient, scanner, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: 'central-scanning' });

    scanner
      .withNextScannerSession()
      .sheet({
        frontPath: bmdFixture.sheet[0],
        backPath: bmdFixture.sheet[1],
      })
      // Invalid BMD ballot
      .sheet({ frontPath: bmdFixture.sheet[1], backPath: bmdFixture.sheet[1] })
      .end();

    await apiClient.scanBatch();
    const { sheetId } = await waitForStatus(apiClient, {
      state: 'needsReview',
    });
    expect(await apiClient.getSheetForReview({ sheetId })).toEqual({
      sheetInterpretation: {
        type: 'InvalidSheet',
        reason: { type: 'unreadable' },
      },
      images: [ANY_BALLOT_IMAGE, ANY_BALLOT_IMAGE],
    });
    {
      const status = await apiClient.getStatus();
      expect(status.canUnconfigure).toEqual(true);
      expect(status.batches.length).toEqual(1);
      expect(status.batches[0]).toEqual<BatchInfo>({
        id: expect.any(String),
        batchNumber: 1,
        label: 'Batch 1',
        count: 2,
        startedAt: expect.any(String),
        endedAt: undefined, // not ended
        pollingPlaceId: 'central-scanning',
      });
    }
    await apiClient.rejectSheet();
    expect(await apiClient.getStatus()).toMatchObject({
      state: 'paused',
      pauseReason: { type: 'review', sheetId },
    });
    scanner
      .withNextScannerSession()
      .sheet({ frontPath: bmdFixture.sheet[0], backPath: bmdFixture.sheet[1] })
      .end();
    await apiClient.resumeBatch();
    await waitForStatus(apiClient, {
      state: 'paused',
      pauseReason: { type: 'tray-empty' },
    });
    await apiClient.saveBatch();
    {
      const status = await apiClient.getStatus();
      expect(status.canUnconfigure).toEqual(true);
      expect(status.batches.length).toEqual(1);
      expect(status.batches[0]).toEqual<BatchInfo>({
        id: expect.any(String),
        batchNumber: 1,
        label: 'Batch 1',
        count: 2, // bad ballot removed
        startedAt: expect.any(String),
        endedAt: expect.any(String),
        pollingPlaceId: 'central-scanning',
      });
    }
  });
});

test('scanBatch with streaked page', async () => {
  const { electionDefinition } = vxFamousNamesFixtures;
  const [frontImageData, backImageData] = asSheet(
    await iter(
      pdfToImages(
        Uint8Array.from(await readFile(vxFamousNamesFixtures.markedBallotPath)),
        { scale: 200 / 72 }
      )
    )
      .map(({ page }) => page)
      .toArray()
  );
  // add a vertical streak
  for (
    let offset = 500;
    offset < frontImageData.data.length;
    offset += frontImageData.width * 4
  ) {
    frontImageData.data[offset] = 0;
    frontImageData.data[offset + 1] = 0;
    frontImageData.data[offset + 2] = 0;
    frontImageData.data[offset + 3] = 255;
  }

  const frontPath = makeTemporaryPath();
  const backPath = makeTemporaryPath();
  await writeImageData(frontPath, frontImageData);
  await writeImageData(backPath, backImageData);

  const scannedBallot: ScannedSheetInfo = {
    frontPath,
    backPath,
  };

  // try with vertical streak detection enabled
  await withApp(async ({ auth, apiClient, scanner, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings({
      ...DEFAULT_SYSTEM_SETTINGS,
      // enable vertical streak detection
      disableVerticalStreakDetection: false,
    });
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: 'central-scanning' });

    scanner.withNextScannerSession().sheet(scannedBallot).end();

    await apiClient.scanBatch();
    const { sheetId } = await waitForStatus(apiClient, {
      state: 'needsReview',
    });
    expect(
      (await apiClient.getSheetForReview({ sheetId })).sheetInterpretation
    ).toEqual({
      type: 'InvalidSheet',
      reason: { type: 'vertical_streaks_detected' },
    });

    // adjudication should be needed because of the vertical streak
    const [frontPage] = workspace.store.getSheetInterpretation(sheetId);
    expect(frontPage).toMatchObject<Partial<PageInterpretation>>({
      type: 'UnreadablePage',
      reason: 'verticalStreaksDetected',
    });
  });

  // try again with vertical streak detection disabled
  await withApp(async ({ auth, apiClient, scanner, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings({
      ...DEFAULT_SYSTEM_SETTINGS,
      // disable vertical streak detection
      disableVerticalStreakDetection: true,
    });
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: 'central-scanning' });

    scanner.withNextScannerSession().sheet(scannedBallot).end();

    await apiClient.scanBatch();
    await waitForStatus(apiClient, {
      state: 'paused',
      pauseReason: { type: 'tray-empty' },
    });

    // no adjudication should be needed
    expect(workspace.store.getBallotsCounted()).toEqual(1);
  });
});

test('accepting a sheet that needs review keeps it and continues scanning', async () => {
  const { electionDefinition } = vxFamousNamesFixtures;
  const [frontImageData, backImageData] = asSheet(
    await iter(
      pdfToImages(
        Uint8Array.from(await readFile(vxFamousNamesFixtures.blankBallotPath)),
        { scale: 200 / 72 }
      )
    )
      .map(({ page }) => page)
      .toArray()
  );
  const frontPath = makeTemporaryPath();
  const backPath = makeTemporaryPath();
  await writeImageData(frontPath, frontImageData);
  await writeImageData(backPath, backImageData);

  await withApp(async ({ auth, apiClient, scanner, workspace, logger }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings({
      ...DEFAULT_SYSTEM_SETTINGS,
      centralScanAdjudicationReasons: [AdjudicationReason.BlankBallot],
    });
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: 'central-scanning' });

    scanner.withNextScannerSession().sheet({ frontPath, backPath }).end();

    await apiClient.scanBatch();
    const { sheetId } = await waitForStatus(apiClient, {
      state: 'needsReview',
    });
    expect(await apiClient.getSheetForReview({ sheetId })).toEqual({
      sheetInterpretation: {
        type: 'NeedsReviewSheet',
        reasons: [{ type: AdjudicationReason.BlankBallot }],
      },
      images: [
        {
          ...ANY_BALLOT_IMAGE,
          layout: expect.objectContaining({
            metadata: expect.objectContaining({ pageNumber: 1 }),
          }),
        },
        {
          ...ANY_BALLOT_IMAGE,
          layout: expect.objectContaining({
            metadata: expect.objectContaining({ pageNumber: 2 }),
          }),
        },
      ],
    });
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScannerEvent,
      'system',
      expect.objectContaining({
        message: expect.stringMatching(
          /^Event: done\.invoke\..*interpretingSheet/
        ),
        eventObject: expect.stringContaining('"reasons":["BlankBallot"]'),
      }),
      expect.any(Function)
    );
    expect(logger.log).toHaveBeenCalledWith(
      LogEventId.ScannerStateChanged,
      'system',
      expect.objectContaining({
        changedFields: expect.stringContaining(`"sheetId":"${sheetId}"`),
      }),
      expect.any(Function)
    );

    await apiClient.acceptSheet();
    expect(await apiClient.getStatus()).toMatchObject({
      state: 'paused',
      pauseReason: { type: 'review', sheetId },
    });
    scanner.withNextScannerSession().end();
    await apiClient.resumeBatch();
    await waitForStatus(apiClient, {
      state: 'paused',
      pauseReason: { type: 'tray-empty' },
    });
    await apiClient.saveBatch();

    const status = await apiClient.getStatus();
    expect(status.state).toEqual('idle');
    expect(status.batches).toEqual([
      expect.objectContaining({ count: 1, endedAt: expect.any(String) }),
    ]);
    expect(workspace.store.getBallotsCounted()).toEqual(1);
  });
});

test('rejects ballots whose precinct is not in the selected polling place', async () => {
  // The famous names fixture's ballot is for precinct '23'. Select the
  // '20-polling-place' location (which covers only precinct '20') so the
  // scanned ballot is rejected as being outside the selected polling place.
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    frontPath: bmdFixture.sheet[0],
    backPath: bmdFixture.sheet[1],
  };

  await withApp(async ({ auth, apiClient, scanner, workspace }) => {
    mockElectionManagerAuth(auth, bmdFixture.electionDefinition);
    workspace.store.setElectionAndJurisdiction({
      electionData: bmdFixture.electionDefinition.electionData,
      jurisdiction,
      electionPackageHash: 'test-election-package-hash',
      ballotHash: bmdFixture.electionDefinition.ballotHash,
    });
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: '20-polling-place' });

    scanner.withNextScannerSession().sheet(scannedBallot).end();

    await apiClient.scanBatch();
    const { sheetId } = await waitForStatus(apiClient, {
      state: 'needsReview',
    });
    expect(
      (await apiClient.getSheetForReview({ sheetId })).sheetInterpretation
    ).toEqual({
      type: 'InvalidSheet',
      reason: { type: 'invalid_precinct' },
    });

    const [frontPage] = workspace.store.getSheetInterpretation(sheetId);
    expect(frontPage).toMatchObject({
      type: 'InvalidPrecinctPage',
      metadata: expect.objectContaining({ precinctId: '23' }),
    });
  });
});

test('reports whether the scanner is attached', async () => {
  await withApp(async ({ apiClient, scanner }) => {
    const isAttached = vi.spyOn(scanner, 'isAttached').mockReturnValue(false);
    expect(await apiClient.getStatus()).toMatchObject({
      state: 'idle',
      isScannerAttached: false,
    });

    isAttached.mockReturnValue(true);
    expect(await apiClient.getStatus()).toMatchObject({
      state: 'idle',
      isScannerAttached: true,
    });
  });
});
