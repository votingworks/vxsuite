import { mockElectionPackageFileTree } from '@votingworks/backend';
import { Buffer } from 'node:buffer';
import { err, ok, sleep } from '@votingworks/basics';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import * as grout from '@votingworks/grout';
import {
  BooleanEnvironmentVariableName,
  getEntries,
  getFeatureFlagMock,
  openZip,
} from '@votingworks/utils';
import { CastVoteRecordExportMetadata } from '@votingworks/types';
import express from 'express';
import { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, expect, test, vi } from 'vitest';
import type { PeerApi } from '@votingworks/admin-backend';
import { mockElectionManagerAuth } from '../test/helpers/auth';
import { generateBmdBallotFixture } from '../test/helpers/ballots';
import { withApp } from '../test/helpers/setup_app';
import { ScannedSheetInfo } from './fujitsu_scanner';
import { AdminHostClient } from './networking';

vi.setConfig({
  testTimeout: 30_000,
});

const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

let hostServer: Server | undefined;

afterEach(async () => {
  if (hostServer) {
    await new Promise<void>((resolve, reject) => {
      hostServer?.close((error) => (error ? reject(error) : resolve()));
    });
    hostServer = undefined;
  }
  featureFlagMock.resetFeatureFlags();
});

async function waitForCondition(
  condition: () => boolean,
  timeoutMs = 15_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('timed out waiting for condition');
    }
    await sleep(50);
  }
}

interface MockHost {
  address: string;
  startInputs: Array<{
    machineId: string;
    batchManifest: CastVoteRecordExportMetadata['batchManifest'];
    isTestMode: boolean;
  }>;
  receivedCvrZips: Array<{ sessionId: string; zip: Buffer }>;
  finishedSessionIds: string[];
}

function startMockHost({
  refuseTransfer = false,
  rejectCvrs = false,
  hangCvrs = false,
}: {
  refuseTransfer?: boolean;
  rejectCvrs?: boolean;
  hangCvrs?: boolean;
} = {}): MockHost {
  const mockHost: Omit<MockHost, 'address'> = {
    startInputs: [],
    receivedCvrZips: [],
    finishedSessionIds: [],
  };

  const hostApp = express();
  hostApp.post('/api/cvr-transfer/:sessionId/cvr', (req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (hangCvrs) {
        // Never respond, simulating a hung connection
        return;
      }
      if (rejectCvrs) {
        res.status(400).json({ error: 'invalid-cast-vote-record' });
        return;
      }
      mockHost.receivedCvrZips.push({
        sessionId: req.params.sessionId,
        zip: Buffer.concat(chunks),
      });
      res.json({ isNew: true });
    });
  });
  const hostApi = grout.createApi({
    startCvrTransfer(input: {
      machineId: string;
      batchManifest: CastVoteRecordExportMetadata['batchManifest'];
      isTestMode: boolean;
    }) {
      mockHost.startInputs.push(input);
      if (refuseTransfer) {
        return err({ type: 'no-election-configured' });
      }
      return ok({ sessionId: `test-session-${mockHost.startInputs.length}` });
    },
    finishCvrTransfer(input: { sessionId: string }) {
      mockHost.finishedSessionIds.push(input.sessionId);
      return ok({
        newlyAdded: mockHost.receivedCvrZips.filter(
          (received) => received.sessionId === input.sessionId
        ).length,
        alreadyPresent: 0,
      });
    },
  });
  hostApp.use('/api', grout.buildRouter(hostApi, express));
  hostServer = hostApp.listen();
  const { port } = hostServer.address() as AddressInfo;
  return { ...mockHost, address: `http://localhost:${port}` };
}

interface MockAdminHostClient extends AdminHostClient {
  setConnected(connected: boolean): void;
}

function mockAdminHostClient(
  address: string,
  { connected: initiallyConnected = true }: { connected?: boolean } = {}
): MockAdminHostClient {
  let connected = initiallyConnected;
  return {
    getHostConnectionInfo: () =>
      connected
        ? { status: 'connected-to-host', hostMachineId: 'ADMIN-01' }
        : { status: 'offline' },
    getHostConnection: () =>
      connected
        ? {
            address,
            machineId: 'ADMIN-01',
            apiClient: grout.createClient<PeerApi>({
              baseUrl: `${address}/api`,
            }),
          }
        : undefined,
    setConnected: (newConnected: boolean) => {
      connected = newConnected;
    },
  };
}

type WithAppContext = Parameters<Parameters<typeof withApp>[0]>[0];

async function configureApp({
  apiClient,
  auth,
  mockUsbDrive,
}: WithAppContext): Promise<void> {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  mockElectionManagerAuth(auth, electionDefinition);
  mockUsbDrive.insertUsbDrive(
    await mockElectionPackageFileTree(
      electionFamousNames2021Fixtures.electionJson.toElectionPackage()
    )
  );
  expect(await apiClient.configureFromElectionPackageOnUsbDrive()).toEqual(
    ok(electionDefinition)
  );
  mockUsbDrive.removeUsbDrive();
  await apiClient.setTestMode({ testMode: true });
}

async function scanAndSaveBatch({
  apiClient,
  scanner,
  importer,
}: WithAppContext): Promise<void> {
  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    front: bmdFixture.sheet[0],
    back: bmdFixture.sheet[1],
  };
  scanner.withNextScannerSession().sheet(scannedBallot).end();
  await apiClient.scanBatch();
  await importer.waitForEndOfBatchOrScanningPause();
  await apiClient.saveBatch();
}

test('a batch is automatically sent to the host as its own export when saved', async () => {
  const mockHost = startMockHost();

  await withApp(
    async (context) => {
      await configureApp(context);
      await scanAndSaveBatch(context);

      // Saving the batch triggers the sync without any user action
      await waitForCondition(() => mockHost.finishedSessionIds.length === 1);

      // The host was told about just this batch and the scanner's mode
      expect(mockHost.startInputs).toHaveLength(1);
      expect(mockHost.startInputs[0].isTestMode).toEqual(true);
      expect(mockHost.startInputs[0].batchManifest).toHaveLength(1);
      expect(mockHost.startInputs[0].batchManifest[0].label).toEqual('Batch 1');
      expect(mockHost.finishedSessionIds).toEqual(['test-session-1']);

      // The uploaded zip contains a complete cast vote record directory
      expect(mockHost.receivedCvrZips).toHaveLength(1);
      const zipFile = await openZip(mockHost.receivedCvrZips[0].zip);
      const entryNames = getEntries(zipFile).map((entry) => entry.name);
      expect(entryNames).toContainEqual(
        expect.stringMatching(/^[^/]+\/cast-vote-record-report\.json$/)
      );
      expect(entryNames.filter((name) => name.endsWith('.png')).length).toEqual(
        2
      );

      // The batch is marked as sent and isn't sent again
      expect(await context.apiClient.getCvrSyncStatus()).toEqual({
        state: 'idle',
        unsentBatchCount: 0,
      });
      await context.cvrSync?.triggerSync();
      expect(mockHost.startInputs).toHaveLength(1);

      // A second batch is sent as its own separate export
      await scanAndSaveBatch(context);
      await waitForCondition(() => mockHost.finishedSessionIds.length === 2);
      expect(mockHost.startInputs).toHaveLength(2);
      expect(mockHost.startInputs[1].batchManifest).toHaveLength(1);
      expect(mockHost.startInputs[1].batchManifest[0].label).toEqual('Batch 2');
      expect(mockHost.finishedSessionIds).toEqual([
        'test-session-1',
        'test-session-2',
      ]);
    },
    { adminHostClient: mockAdminHostClient(mockHost.address) }
  );
});

test('batches saved while offline are sent automatically once the host connects', async () => {
  const mockHost = startMockHost();
  const adminHostClient = mockAdminHostClient(mockHost.address, {
    connected: false,
  });

  await withApp(
    async (context) => {
      await configureApp(context);
      await scanAndSaveBatch(context);
      await scanAndSaveBatch(context);

      // Nothing is sent while offline
      await context.cvrSync?.triggerSync();
      expect(mockHost.startInputs).toHaveLength(0);
      expect(await context.apiClient.getCvrSyncStatus()).toEqual({
        state: 'idle',
        unsentBatchCount: 2,
      });

      // Once the host connects, the polling loop sends each unsent batch as
      // its own export, oldest first
      adminHostClient.setConnected(true);
      await waitForCondition(() => mockHost.finishedSessionIds.length === 2);
      expect(mockHost.startInputs).toHaveLength(2);
      expect(mockHost.startInputs[0].batchManifest[0].label).toEqual('Batch 1');
      expect(mockHost.startInputs[1].batchManifest[0].label).toEqual('Batch 2');
      expect(await context.apiClient.getCvrSyncStatus()).toEqual({
        state: 'idle',
        unsentBatchCount: 0,
      });
    },
    { adminHostClient, cvrSyncPollingIntervalMs: 100 }
  );
});

test('a batch stays unsent and the error is surfaced when the host refuses the transfer', async () => {
  const mockHost = startMockHost({ refuseTransfer: true });

  await withApp(
    async (context) => {
      await configureApp(context);
      await scanAndSaveBatch(context);

      await context.cvrSync?.triggerSync();
      const syncStatus = await context.apiClient.getCvrSyncStatus();
      expect(syncStatus.unsentBatchCount).toEqual(1);
      expect(syncStatus.lastError).toContain('Host refused the transfer');
      expect(mockHost.receivedCvrZips).toHaveLength(0);
      expect(mockHost.finishedSessionIds).toHaveLength(0);
    },
    { adminHostClient: mockAdminHostClient(mockHost.address) }
  );
});

test('a batch stays unsent and the error is surfaced when the host rejects a cast vote record', async () => {
  const mockHost = startMockHost({ rejectCvrs: true });

  await withApp(
    async (context) => {
      await configureApp(context);
      await scanAndSaveBatch(context);

      await context.cvrSync?.triggerSync();
      const syncStatus = await context.apiClient.getCvrSyncStatus();
      expect(syncStatus.unsentBatchCount).toEqual(1);
      expect(syncStatus.lastError).toContain('400');
      expect(mockHost.finishedSessionIds).toHaveLength(0);
    },
    { adminHostClient: mockAdminHostClient(mockHost.address) }
  );
});

test('a batch stays unsent and a timeout error is surfaced when a cast vote record upload hangs', async () => {
  const mockHost = startMockHost({ hangCvrs: true });

  await withApp(
    async (context) => {
      await configureApp(context);
      await scanAndSaveBatch(context);

      await context.cvrSync?.triggerSync();
      const syncStatus = await context.apiClient.getCvrSyncStatus();
      expect(syncStatus.unsentBatchCount).toEqual(1);
      expect(syncStatus.lastError).toEqual(
        'Upload timed out after 0.1 seconds.'
      );
      expect(mockHost.finishedSessionIds).toHaveLength(0);
    },
    {
      adminHostClient: mockAdminHostClient(mockHost.address),
      cvrSyncUploadTimeoutMs: 100,
    }
  );
});

test('getCvrSyncStatus reports idle with no unsent batches when networking is not running', async () => {
  await withApp(async ({ apiClient }) => {
    expect(await apiClient.getCvrSyncStatus()).toEqual({
      state: 'idle',
      unsentBatchCount: 0,
    });
  });
});

test('getHostConnectionInfo reflects the admin host client state', async () => {
  await withApp(async ({ apiClient }) => {
    expect(await apiClient.getHostConnectionInfo()).toEqual({
      status: 'offline',
    });
  });

  await withApp(
    async ({ apiClient }) => {
      expect(await apiClient.getHostConnectionInfo()).toEqual({
        status: 'connected-to-host',
        hostMachineId: 'ADMIN-01',
      });
    },
    { adminHostClient: mockAdminHostClient('http://localhost:9999') }
  );
});
