import { deferred, iter } from '@votingworks/basics';
import {
  electionFamousNames2021Fixtures,
  makeTemporaryPath,
} from '@votingworks/fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import {
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
import { readFile } from 'node:fs/promises';
import { beforeEach, expect, test, vi } from 'vitest';
import { mockElectionManagerAuth } from '../test/helpers/auth';
import { generateBmdBallotFixture } from '../test/helpers/ballots';
import { withApp } from '../test/helpers/setup_app';
import { ScannedSheetInfo } from './fujitsu_scanner';

const jurisdiction = TEST_JURISDICTION;

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

test('scanBatch with multiple sheets', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    front: bmdFixture.sheet[0],
    back: bmdFixture.sheet[1],
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
    await importer.waitForEndOfBatchOrScanningPause();

    // the batch pauses when the tray empties, staying open for more sheets
    {
      const status = await apiClient.getStatus();
      expect(status.adjudicationsRemaining).toEqual(0);
      expect(status.currentBatch).toEqual({
        batchId: status.batches[0].id,
        state: 'paused',
        pauseReason: 'tray-empty',
      });
      expect(status.batches.length).toEqual(1);
      expect(status.batches[0].count).toEqual(3);
      expect(status.batches[0].endedAt).toBeUndefined();
    }

    // continuing scans another stack into the same batch
    scanner.withNextScannerSession().sheet(scannedBallot).end();
    await apiClient.continueBatch();
    await importer.waitForEndOfBatchOrScanningPause();

    // saving finalizes the batch
    await apiClient.saveBatch();
    const status = await apiClient.getStatus();
    expect(status.currentBatch).toBeUndefined();
    expect(status.canUnconfigure).toEqual(true);
    expect(status.batches.length).toEqual(1);
    expect(status.batches[0]).toEqual<BatchInfo>({
      id: expect.any(String),
      batchNumber: 1,
      label: 'Batch 1',
      count: 4,
      startedAt: expect.any(String),
      endedAt: expect.any(String),
      pollingPlaceId: '23-polling-place',
    });
  });
});

test('cancelBatch while scanning halts the feed and discards the batch', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    front: bmdFixture.sheet[0],
    back: bmdFixture.sheet[1],
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
    await apiClient.setPollingPlaceId({ id: '23-polling-place' });

    // scan one sheet, then hold the next sheet in the scanner while the
    // operator presses stop
    const gate = deferred<void>();
    scanner
      .withNextScannerSession()
      .sheet(scannedBallot)
      .sheet(scannedBallot, gate.promise)
      .end();

    await apiClient.scanBatch();
    // Interpreting the first sheet can take a while under load; the default
    // 1s timeout flakes.
    await vi.waitFor(
      async () => {
        const status = await apiClient.getStatus();
        expect(status.batches[0]?.count).toEqual(1);
      },
      { timeout: 10_000 }
    );

    // stopping discards the whole batch, including the in-flight sheet
    const cancelPromise = apiClient.cancelBatch();
    gate.resolve();
    await cancelPromise;

    const status = await apiClient.getStatus();
    expect(status.currentBatch).toBeUndefined();
    expect(status.batches).toEqual([]);
  });
});

test('cancelBatch discards a sheet awaiting review', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  await withApp(async ({ auth, apiClient, scanner, importer, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: 'central-scanning' });

    scanner
      .withNextScannerSession()
      .sheet({ front: bmdFixture.sheet[0], back: bmdFixture.sheet[1] })
      // Invalid BMD ballot
      .sheet({ front: bmdFixture.sheet[1], back: bmdFixture.sheet[1] })
      .end();

    await apiClient.scanBatch();
    await importer.waitForEndOfBatchOrScanningPause();
    {
      const status = await apiClient.getStatus();
      expect(status.adjudicationsRemaining).toEqual(1);
      expect(status.currentBatch?.pauseReason).toEqual('ballot-review');
    }

    // canceling discards the batch, including the sheet awaiting review
    await apiClient.cancelBatch();
    {
      const status = await apiClient.getStatus();
      expect(status.currentBatch).toBeUndefined();
      expect(status.adjudicationsRemaining).toEqual(0);
      expect(status.batches).toEqual([]);
    }
  });
});

test('batch control endpoints log failures when there is no batch to act on', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  await withApp(async ({ auth, apiClient, importer, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: '23-polling-place' });

    // these log a failure and return without throwing
    await apiClient.continueBatch();
    await apiClient.saveBatch();
    await apiClient.continueScanning({ forceAccept: false });
    // canceling rethrows, like deleting a batch
    await expect(apiClient.cancelBatch()).rejects.toThrowError(
      'no batch in progress'
    );

    const status = await apiClient.getStatus();
    expect(status.currentBatch).toBeUndefined();
    expect(status.batches).toEqual([]);
  });
});

test('continueScanning after invalid ballot', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  await withApp(async ({ auth, apiClient, scanner, importer, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: 'central-scanning' });

    scanner
      .withNextScannerSession()
      .sheet({
        front: bmdFixture.sheet[0],
        back: bmdFixture.sheet[1],
      })
      // Invalid BMD ballot
      .sheet({ front: bmdFixture.sheet[1], back: bmdFixture.sheet[1] })
      .end();

    await apiClient.scanBatch();
    await importer.waitForEndOfBatchOrScanningPause();
    {
      const status = await apiClient.getStatus();
      expect(status.adjudicationsRemaining).toEqual(1);
      expect(status.canUnconfigure).toEqual(true);
      expect(status.currentBatch).toEqual({
        batchId: status.batches[0].id,
        state: 'paused',
        pauseReason: 'ballot-review',
      });
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

    // the batch can't be continued or saved until the sheet under review is
    // resolved
    await apiClient.continueBatch(); // logs a failure and returns
    await apiClient.saveBatch(); // logs a failure and returns

    // resolving the sheet leaves the batch paused
    await apiClient.continueScanning({ forceAccept: false });
    // resolving again is a no-op since no sheet is pending review
    await apiClient.continueScanning({ forceAccept: false });
    {
      const status = await apiClient.getStatus();
      expect(status.adjudicationsRemaining).toEqual(0);
      expect(status.currentBatch).toEqual({
        batchId: status.batches[0].id,
        state: 'paused',
        pauseReason: 'ballot-review',
      });
      expect(status.batches[0].count).toEqual(1); // bad ballot removed
      expect(status.batches[0].endedAt).toBeUndefined();
    }

    // reload the remaining sheets and continue the same batch
    scanner
      .withNextScannerSession()
      .sheet({ front: bmdFixture.sheet[0], back: bmdFixture.sheet[1] })
      .end();
    await apiClient.continueBatch();
    await importer.waitForEndOfBatchOrScanningPause();

    await apiClient.saveBatch();
    {
      const status = await apiClient.getStatus();
      expect(status.adjudicationsRemaining).toEqual(0);
      expect(status.canUnconfigure).toEqual(true);
      expect(status.currentBatch).toBeUndefined();
      expect(status.batches.length).toEqual(1);
      expect(status.batches[0]).toEqual<BatchInfo>({
        id: expect.any(String),
        batchNumber: 1,
        label: 'Batch 1',
        count: 2,
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
    front: frontPath,
    back: backPath,
  };

  // try with vertical streak detection enabled
  await withApp(async ({ auth, apiClient, scanner, importer, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    workspace.store.setSystemSettings({
      ...DEFAULT_SYSTEM_SETTINGS,
      // enable vertical streak detection
      disableVerticalStreakDetection: false,
    });
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: 'central-scanning' });

    scanner.withNextScannerSession().sheet(scannedBallot).end();

    await apiClient.scanBatch();
    await importer.waitForEndOfBatchOrScanningPause();

    const nextAdjudicationSheet = workspace.store.getNextAdjudicationSheet();

    // adjudication should be needed because of the vertical streak
    expect(nextAdjudicationSheet?.pages[0]).toMatchObject<
      Partial<PageInterpretation>
    >({
      type: 'UnreadablePage',
      reason: 'verticalStreaksDetected',
    });
  });

  // try again with vertical streak detection disabled
  await withApp(async ({ auth, apiClient, scanner, importer, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    importer.configure(
      electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    workspace.store.setSystemSettings({
      ...DEFAULT_SYSTEM_SETTINGS,
      // disable vertical streak detection
      disableVerticalStreakDetection: true,
    });
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: 'central-scanning' });

    scanner.withNextScannerSession().sheet(scannedBallot).end();

    await apiClient.scanBatch();
    await importer.waitForEndOfBatchOrScanningPause();

    // no adjudication should be needed
    expect(workspace.store.getNextAdjudicationSheet()).toBeUndefined();
  });
});

test('stops ballots from a different precinct than the rest of the batch', async () => {
  // Batches are organized by precinct. The 'central-scanning' polling place
  // covers every precinct, so the polling place check alone cannot catch a
  // mixed batch: the first ballot (precinct '23') sets the batch's precinct,
  // and the precinct '20' ballot that follows is stopped for adjudication.
  const batchPrecinctFixture = await generateBmdBallotFixture();
  const otherPrecinctFixture = await generateBmdBallotFixture({
    ballotStyleId: '1-1',
    precinctId: '20',
  });
  const batchPrecinctBallot: ScannedSheetInfo = {
    front: batchPrecinctFixture.sheet[0],
    back: batchPrecinctFixture.sheet[1],
  };
  const otherPrecinctBallot: ScannedSheetInfo = {
    front: otherPrecinctFixture.sheet[0],
    back: otherPrecinctFixture.sheet[1],
  };

  await withApp(async ({ auth, apiClient, scanner, importer, workspace }) => {
    mockElectionManagerAuth(auth, batchPrecinctFixture.electionDefinition);
    importer.configure(
      batchPrecinctFixture.electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: 'central-scanning' });

    scanner
      .withNextScannerSession()
      .sheet(batchPrecinctBallot)
      .sheet(otherPrecinctBallot)
      .end();

    await apiClient.scanBatch();
    await importer.waitForEndOfBatchOrScanningPause();

    // the first ballot counted; the second stopped for adjudication
    const status = await apiClient.getStatus();
    expect(status.adjudicationsRemaining).toEqual(1);
    const nextAdjudicationSheet = workspace.store.getNextAdjudicationSheet();
    expect(nextAdjudicationSheet?.pages[0]).toMatchObject({
      type: 'InvalidPrecinctPage',
      metadata: expect.objectContaining({ precinctId: '20' }),
    });
  });
});

test('rejects ballots whose precinct is not in the selected polling place', async () => {
  // The famous names fixture's ballot is for precinct '23'. Select the
  // '20-polling-place' location (which covers only precinct '20') so the
  // scanned ballot is rejected as being outside the selected polling place.
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    front: bmdFixture.sheet[0],
    back: bmdFixture.sheet[1],
  };

  await withApp(async ({ auth, apiClient, scanner, importer, workspace }) => {
    mockElectionManagerAuth(auth, bmdFixture.electionDefinition);
    importer.configure(
      bmdFixture.electionDefinition,
      jurisdiction,
      'test-election-package-hash'
    );
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });
    await apiClient.setPollingPlaceId({ id: '20-polling-place' });

    scanner.withNextScannerSession().sheet(scannedBallot).end();

    await apiClient.scanBatch();
    await importer.waitForEndOfBatchOrScanningPause();

    const nextAdjudicationSheet = workspace.store.getNextAdjudicationSheet();
    expect(nextAdjudicationSheet?.pages[0]).toMatchObject({
      type: 'InvalidPrecinctPage',
      metadata: expect.objectContaining({ precinctId: '23' }),
    });
  });
});
