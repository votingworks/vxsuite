import { beforeEach, expect, test, vi } from 'vitest';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { AddressInfo } from 'node:net';
import tmp from 'tmp';
import { DEV_MACHINE_ID } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { err, typedAs } from '@votingworks/basics';
import { createMockMultiUsbDrive } from '@votingworks/usb-drive';
import { buildClientApp, ClientApi } from './client_app';
import { createClientWorkspace } from './util/workspace';
import { ClientConnectionStatus, ElectionRecord } from './types';
import {
  getMountedUsbDriveDevPath,
  mockMachineLocked,
  mockSystemAdministratorAuth,
  buildMockLogger,
} from '../test/app';

function buildClientTestEnvironment() {
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const workspaceRoot = tmp.dirSync().name;
  const workspace = createClientWorkspace(workspaceRoot);
  const logger = buildMockLogger(auth, workspace.clientStore);
  const mockMultiUsbDrive = createMockMultiUsbDrive();
  const app = buildClientApp({
    auth,
    workspace,
    logger,
    multiUsbDrive: mockMultiUsbDrive.multiUsbDrive,
  });
  const server = app.listen();
  const { port } = server.address() as AddressInfo;
  const apiClient = grout.createClient<ClientApi>({
    baseUrl: `http://localhost:${port}/api`,
  });

  mockMachineLocked(auth);

  return {
    auth,
    workspace,
    apiClient,
    server,
    mockUsbDrive: mockMultiUsbDrive,
  };
}

let env: ReturnType<typeof buildClientTestEnvironment>;

beforeEach(() => {
  env = buildClientTestEnvironment();
  return () => {
    env.server.close();
  };
});

test('getMachineConfig returns machine config', async () => {
  const config = await env.apiClient.getMachineConfig();
  expect(config).toEqual({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
  });
});

test('getMachineMode returns host by default', async () => {
  const mode = await env.apiClient.getMachineMode();
  expect(mode).toEqual('host');
});

test('setMachineMode and getMachineMode round-trip', async () => {
  await env.apiClient.setMachineMode({ mode: 'client' });
  expect(await env.apiClient.getMachineMode()).toEqual('client');

  await env.apiClient.setMachineMode({ mode: 'host' });
  expect(await env.apiClient.getMachineMode()).toEqual('host');
});

test('getAdjudicationSessionStatus returns disabled by default', async () => {
  const result = await env.apiClient.getAdjudicationSessionStatus();
  expect(result).toEqual({ isClientAdjudicationEnabled: false });
});

test('getAuthStatus returns auth status', async () => {
  const authStatus = await env.apiClient.getAuthStatus();
  expect(authStatus).toEqual({
    status: 'logged_out',
    reason: 'machine_locked',
  });
});

test('checkPin delegates to auth', async () => {
  mockSystemAdministratorAuth(env.auth);
  await env.apiClient.checkPin({ pin: '000000' });
  expect(env.auth.checkPin).toHaveBeenCalled();
});

test('logOut delegates to auth', async () => {
  mockSystemAdministratorAuth(env.auth);
  await env.apiClient.logOut();
  expect(env.auth.logOut).toHaveBeenCalled();
});

test('getNetworkConnectionStatus defaults to offline', async () => {
  expect(await env.apiClient.getNetworkConnectionStatus()).toEqual({
    status: 'offline',
  });
});

test('getNetworkConnectionStatus returns current status from client store', async () => {
  expect(await env.apiClient.getNetworkConnectionStatus()).toEqual({
    status: 'offline',
  });

  env.workspace.clientStore.setConnection(
    ClientConnectionStatus.OnlineWaitingForHost
  );
  expect(await env.apiClient.getNetworkConnectionStatus()).toEqual({
    status: 'online-waiting-for-host',
  });

  env.workspace.clientStore.setConnection(
    ClientConnectionStatus.OnlineConnectedToHost,
    {
      address: 'http://192.168.1.10:3002',
      machineId: '0001',
      apiClient: typedAs<grout.Client<never>>({}),
    }
  );
  expect(await env.apiClient.getNetworkConnectionStatus()).toEqual({
    status: 'online-connected-to-host',
    hostMachineId: '0001',
  });
});

test('getCurrentElectionMetadata returns null when no cached data', async () => {
  expect(await env.apiClient.getCurrentElectionMetadata()).toBeNull();
});

test('getCurrentElectionMetadata returns cached election record', async () => {
  const mockRecord: ElectionRecord = {
    id: 'election-1',
    electionDefinition: readElectionGeneralDefinition(),
    createdAt: new Date().toISOString(),
    isOfficialResults: false,
    electionPackageHash: 'test-hash',
  };
  env.workspace.clientStore.setCachedElectionRecord(mockRecord);
  const result = await env.apiClient.getCurrentElectionMetadata();
  expect(result?.id).toEqual('election-1');
});

test('getUsbDriveStatus returns usb drive status', async () => {
  env.mockUsbDrive.insertUsbDrive({});
  const status = await env.apiClient.getUsbDriveStatus();
  expect(status.status).toEqual('mounted');
});

test('ejectUsbDrive ejects the usb drive', async () => {
  env.mockUsbDrive.insertUsbDrive({});
  const devPath = getMountedUsbDriveDevPath(env.mockUsbDrive);
  env.mockUsbDrive.multiUsbDrive.ejectDrive.expectCallWith(devPath).resolves();
  await env.apiClient.ejectUsbDrive();
});

test('formatUsbDrive returns error when not system administrator', async () => {
  (await env.apiClient.formatUsbDrive()).assertErr(
    'Formatting USB drive requires system administrator auth.'
  );
});

test('formatUsbDrive formats drive when system administrator', async () => {
  mockSystemAdministratorAuth(env.auth);
  env.mockUsbDrive.insertUsbDrive({});
  const devPath = getMountedUsbDriveDevPath(env.mockUsbDrive);
  env.mockUsbDrive.multiUsbDrive.formatDrive
    .expectCallWith(devPath, 'fat32')
    .resolves();
  (await env.apiClient.formatUsbDrive()).assertOk('format failed');
});

test('formatUsbDrive returns error when format fails', async () => {
  mockSystemAdministratorAuth(env.auth);
  env.mockUsbDrive.insertUsbDrive({});
  const devPath = getMountedUsbDriveDevPath(env.mockUsbDrive);
  env.mockUsbDrive.multiUsbDrive.formatDrive
    .expectCallWith(devPath, 'fat32')
    .throws(new Error('format failed'));
  expect(await env.apiClient.formatUsbDrive()).toEqual(
    err(new Error('format failed'))
  );
});

test('getDiskSpaceSummary returns disk space', async () => {
  const summary = await env.apiClient.getDiskSpaceSummary();
  expect(summary).toEqual(
    expect.objectContaining({ available: expect.any(Number) })
  );
});

test('getBatteryInfo returns battery info', async () => {
  const info = await env.apiClient.getBatteryInfo();
  // Returns null in test environment since no real battery
  expect(info === null || typeof info === 'object').toEqual(true);
});
