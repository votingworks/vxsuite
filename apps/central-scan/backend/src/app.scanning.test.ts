import {
  electionFamousNames2021Fixtures,
  electionGridLayoutNewHampshireTestBallotFixtures,
} from '@votingworks/fixtures';
import { loadImageData, writeImageData } from '@votingworks/image-utils';
import {
  BallotPageInfo,
  BatchInfo,
  DEFAULT_SYSTEM_SETTINGS,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { mockElectionManagerAuth } from '../test/helpers/auth';
import { generateBmdBallotFixture } from '../test/helpers/ballots';
import { withApp } from '../test/helpers/setup_app';
import { ScannedSheetInfo } from './fujitsu_scanner';

const jurisdiction = TEST_JURISDICTION;

test('scanBatch with multiple sheets', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
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

test('continueScanning after invalid ballot', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
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

test('scanBatch with streaked page', async () => {
  const electionDefinition =
    electionGridLayoutNewHampshireTestBallotFixtures.readElectionDefinition();
  const { scanMarkedFront, scanMarkedBack } =
    electionGridLayoutNewHampshireTestBallotFixtures;

  const frontPath = scanMarkedFront.asFilePath();
  const backPath = scanMarkedBack.asFilePath();

  const frontImageData = await loadImageData(frontPath);

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

  await writeImageData(frontPath, frontImageData);

  const scannedBallot: ScannedSheetInfo = {
    frontPath,
    backPath,
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

    scanner.withNextScannerSession().sheet(scannedBallot).end();

    await apiClient.scanBatch();
    await importer.waitForEndOfBatchOrScanningPause();

    const nextAdjudicationSheet = workspace.store.getNextAdjudicationSheet();

    // adjudication should be needed because of the vertical streak
    expect(nextAdjudicationSheet?.front).toMatchObject<Partial<BallotPageInfo>>(
      {
        interpretation: {
          type: 'UnreadablePage',
          reason: 'verticalStreaksDetected',
        },
      }
    );
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

    scanner.withNextScannerSession().sheet(scannedBallot).end();

    await apiClient.scanBatch();
    await importer.waitForEndOfBatchOrScanningPause();

    // no adjudication should be needed
    expect(workspace.store.getNextAdjudicationSheet()).toBeUndefined();
  });
});
