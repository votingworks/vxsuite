import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  BatchInfo,
  DEFAULT_SYSTEM_SETTINGS,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { withApp } from '../test/helpers/setup_app';
import { mockElectionManagerAuth } from '../test/helpers/auth';

const jurisdiction = TEST_JURISDICTION;

test('scanBatch with multiple sheets', async () => {
  const { electionDefinition } = electionFamousNames2021Fixtures;
  await withApp(async ({ auth, apiClient, scanner, importer, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    importer.configure(electionDefinition, jurisdiction);
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });

    scanner
      .withNextScannerSession()
      .sheet({
        frontPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
        backPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
      })
      .sheet({
        frontPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
        backPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
      })
      .sheet({
        frontPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
        backPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
      })
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
  const { electionDefinition } = electionFamousNames2021Fixtures;
  await withApp(async ({ auth, apiClient, scanner, importer, workspace }) => {
    mockElectionManagerAuth(auth, electionDefinition);
    importer.configure(electionDefinition, jurisdiction);
    workspace.store.setSystemSettings(DEFAULT_SYSTEM_SETTINGS);
    await apiClient.setTestMode({ testMode: true });

    scanner
      .withNextScannerSession()
      .sheet({
        frontPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
        backPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
      })
      .sheet({
        frontPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
        backPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(), // invalid BMD ballot
      })
      .sheet({
        frontPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage1.asFilePath(),
        backPath:
          electionFamousNames2021Fixtures.machineMarkedBallotPage2.asFilePath(),
      })
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
