import { mockElectionPackageFileTree } from '@votingworks/backend';
import { Buffer } from 'node:buffer';
import { err, ok } from '@votingworks/basics';
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

interface MockHost {
  address: string;
  startInputs: Array<{
    machineId: string;
    batchManifest: CastVoteRecordExportMetadata['batchManifest'];
    isTestMode: boolean;
  }>;
  receivedCvrZips: Buffer[];
  finishedSessionIds: string[];
}

function startMockHost({
  refuseTransfer = false,
  rejectCvrs = false,
}: {
  refuseTransfer?: boolean;
  rejectCvrs?: boolean;
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
      if (rejectCvrs) {
        res.status(400).json({ error: 'invalid-cast-vote-record' });
        return;
      }
      mockHost.receivedCvrZips.push(Buffer.concat(chunks));
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
      return ok({ sessionId: 'test-session' });
    },
    finishCvrTransfer(input: { sessionId: string }) {
      mockHost.finishedSessionIds.push(input.sessionId);
      return ok({
        newlyAdded: mockHost.receivedCvrZips.length,
        alreadyPresent: 0,
      });
    },
  });
  hostApp.use('/api', grout.buildRouter(hostApi, express));
  hostServer = hostApp.listen();
  const { port } = hostServer.address() as AddressInfo;
  return { ...mockHost, address: `http://localhost:${port}` };
}

function mockAdminHostClient(address: string): AdminHostClient {
  return {
    getHostConnectionInfo: () => ({
      status: 'connected-to-host',
      hostMachineId: 'ADMIN-01',
    }),
    getHostConnection: () => ({
      address,
      machineId: 'ADMIN-01',
      apiClient: grout.createClient<PeerApi>({ baseUrl: `${address}/api` }),
    }),
  };
}

type WithAppContext = Parameters<Parameters<typeof withApp>[0]>[0];

async function configureAndScanOneBallot({
  apiClient,
  auth,
  mockUsbDrive,
  scanner,
  importer,
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

  const bmdFixture = await generateBmdBallotFixture();
  const scannedBallot: ScannedSheetInfo = {
    front: bmdFixture.sheet[0],
    back: bmdFixture.sheet[1],
  };
  scanner.withNextScannerSession().sheet(scannedBallot).end();
  await apiClient.scanBatch();
  await importer.waitForEndOfBatchOrScanningPause();
}

test('sendCastVoteRecordsToHost returns an error when no host is connected', async () => {
  await withApp(async ({ apiClient }) => {
    expect(await apiClient.sendCastVoteRecordsToHost()).toEqual(
      err({ type: 'no-host-connected' })
    );
    expect(await apiClient.getSendCvrsProgress()).toEqual(null);
  });
});

test('sendCastVoteRecordsToHost sends each cast vote record to the host', async () => {
  const mockHost = startMockHost();

  await withApp(
    async (context) => {
      await configureAndScanOneBallot(context);

      expect(await context.apiClient.sendCastVoteRecordsToHost()).toEqual(
        ok({ newlyAdded: 1, alreadyPresent: 0 })
      );

      // The host was told about the scanner's batches and mode
      expect(mockHost.startInputs).toHaveLength(1);
      expect(mockHost.startInputs[0].isTestMode).toEqual(true);
      expect(mockHost.startInputs[0].batchManifest).toHaveLength(1);
      expect(mockHost.finishedSessionIds).toEqual(['test-session']);

      // The uploaded zip contains a complete cast vote record directory
      expect(mockHost.receivedCvrZips).toHaveLength(1);
      const zipFile = await openZip(mockHost.receivedCvrZips[0]);
      const entryNames = getEntries(zipFile).map((entry) => entry.name);
      expect(entryNames).toContainEqual(
        expect.stringMatching(/^[^/]+\/cast-vote-record-report\.json$/)
      );
      expect(entryNames.filter((name) => name.endsWith('.png')).length).toEqual(
        2
      );

      // Progress resets after the send completes
      expect(await context.apiClient.getSendCvrsProgress()).toEqual(null);
    },
    { adminHostClient: mockAdminHostClient(mockHost.address) }
  );
});

test('sendCastVoteRecordsToHost returns an error when the host refuses the transfer', async () => {
  const mockHost = startMockHost({ refuseTransfer: true });

  await withApp(
    async (context) => {
      await configureAndScanOneBallot(context);

      const result = await context.apiClient.sendCastVoteRecordsToHost();
      expect(result).toEqual(
        err({
          type: 'upload-failed',
          message: expect.stringContaining('Host refused the transfer'),
        })
      );
      expect(mockHost.receivedCvrZips).toHaveLength(0);
    },
    { adminHostClient: mockAdminHostClient(mockHost.address) }
  );
});

test('sendCastVoteRecordsToHost returns an error when the host rejects a cast vote record', async () => {
  const mockHost = startMockHost({ rejectCvrs: true });

  await withApp(
    async (context) => {
      await configureAndScanOneBallot(context);

      const result = await context.apiClient.sendCastVoteRecordsToHost();
      expect(result).toEqual(
        err({
          type: 'upload-failed',
          message: expect.stringContaining('400'),
        })
      );
      expect(mockHost.finishedSessionIds).toHaveLength(0);
    },
    { adminHostClient: mockAdminHostClient(mockHost.address) }
  );
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
