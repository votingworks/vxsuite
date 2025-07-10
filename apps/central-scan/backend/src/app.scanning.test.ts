import { iter } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { vxFamousNamesFixtures } from '@votingworks/hmpb';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import {
  asSheet,
  BallotPageInfo,
  BatchInfo,
  DEFAULT_SYSTEM_SETTINGS,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { readFile } from 'node:fs/promises';
import { fileSync } from 'tmp';
import { expect, test } from 'vitest';
import { mockElectionManagerAuth } from '../test/helpers/auth';
import { generateBmdBallotFixture } from '../test/helpers/ballots';
import { withApp } from '../test/helpers/setup_app';
import { ScannedSheetInfo } from './fujitsu_scanner';

const jurisdiction = TEST_JURISDICTION;

test('scanBatch with multiple sheets', async () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    frontPath: bmdFixture.sheet[0],
    backPath: bmdFixture.sheet[1],
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

    scanner
      .withNextScannerSession()
      .sheet({
        frontPath: bmdFixture.sheet[0],
        backPath: bmdFixture.sheet[1],
      })
      // Invalid BMD ballot
      .sheet({ frontPath: bmdFixture.sheet[1], backPath: bmdFixture.sheet[1] })
      .sheet({ frontPath: bmdFixture.sheet[0], backPath: bmdFixture.sheet[1] })
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

  const frontPath = fileSync().name;
  const backPath = fileSync().name;
  await writeImageData(frontPath, frontImageData);
  await writeImageData(backPath, backImageData);

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
