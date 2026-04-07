import { beforeEach, expect, test, vi } from 'vitest';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { AddressInfo } from 'node:net';
import tmp from 'tmp';
import { DEV_MACHINE_ID, SystemSettings } from '@votingworks/types';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { err, ok, typedAs } from '@votingworks/basics';
import { createMockMultiUsbDrive } from '@votingworks/usb-drive';
import { buildClientApp, ClientApi } from './client_app';
import type { PeerApi } from './peer_app';
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

test('setMachineMode throws when election is configured', async () => {
  const mockRecord: ElectionRecord = {
    id: 'election-1',
    electionDefinition: readElectionGeneralDefinition(),
    createdAt: new Date().toISOString(),
    isOfficialResults: false,
    electionPackageHash: 'test-hash',
  };
  env.workspace.clientStore.setCachedElectionRecord(mockRecord);
  await expect(env.apiClient.setMachineMode({ mode: 'host' })).rejects.toThrow(
    'Cannot change machine mode while an election is configured.'
  );
});

test('getAdjudicationSessionStatus returns disabled by default', async () => {
  const result = await env.apiClient.getAdjudicationSessionStatus();
  expect(result).toEqual({ isClientAdjudicationEnabled: false });
});

test('getSystemSettings returns defaults when no cached settings', async () => {
  const result = await env.apiClient.getSystemSettings();
  expect(result).toEqual(DEFAULT_SYSTEM_SETTINGS);
});

test('getSystemSettings returns cached settings from host', async () => {
  const customSettings: SystemSettings = {
    ...DEFAULT_SYSTEM_SETTINGS,
    markThresholds: {
      definite: 0.12,
      marginal: 0.08,
    },
  };
  env.workspace.clientStore.setCachedSystemSettings(customSettings);
  const result = await env.apiClient.getSystemSettings();
  expect(result).toEqual(customSettings);
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

  env.workspace.clientStore.setConnection(
    ClientConnectionStatus.OnlineMultipleHostsDetected
  );
  expect(await env.apiClient.getNetworkConnectionStatus()).toEqual({
    status: 'online-multiple-hosts-detected',
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

interface MockPeerApi {
  claimBallot: ReturnType<typeof vi.fn>;
  releaseBallot: ReturnType<typeof vi.fn>;
  getBallotAdjudicationData: ReturnType<typeof vi.fn>;
  getBallotImageMetadata: ReturnType<typeof vi.fn>;
  getWriteInCandidates: ReturnType<typeof vi.fn>;
  adjudicateCvrContest: ReturnType<typeof vi.fn>;
  setCvrResolved: ReturnType<typeof vi.fn>;
}

function connectToMockHost(): { mockPeerApi: MockPeerApi } {
  const mockPeerApi: MockPeerApi = {
    claimBallot: vi.fn(),
    releaseBallot: vi.fn(),
    getBallotAdjudicationData: vi.fn(),
    getBallotImageMetadata: vi.fn(),
    getWriteInCandidates: vi.fn(),
    adjudicateCvrContest: vi.fn(),
    setCvrResolved: vi.fn(),
  };
  env.workspace.clientStore.setConnection(
    ClientConnectionStatus.OnlineConnectedToHost,
    {
      address: 'http://localhost:3002',
      machineId: 'HOST-001',
      apiClient: mockPeerApi as unknown as grout.Client<PeerApi>,
    }
  );
  return { mockPeerApi };
}

test('claimBallot proxies to host peer API', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.claimBallot.mockResolvedValue('cvr-1');

  const result = await env.apiClient.claimBallot({});
  expect(result).toEqual(ok('cvr-1'));
  expect(mockPeerApi.claimBallot).toHaveBeenCalledWith(
    expect.objectContaining({ machineId: DEV_MACHINE_ID })
  );
});

test('claimBallot returns undefined when no ballots available', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.claimBallot.mockResolvedValue(undefined);

  const result = await env.apiClient.claimBallot({});
  expect(result).toEqual(ok(undefined));
});

test('proxy endpoints return host-disconnect error when not connected', async () => {
  expect(await env.apiClient.claimBallot({})).toEqual(
    err({ type: 'host-disconnect' })
  );
  expect(await env.apiClient.releaseBallot({ cvrId: 'cvr-1' })).toEqual(
    err({ type: 'host-disconnect' })
  );
  expect(
    await env.apiClient.getBallotAdjudicationData({ cvrId: 'cvr-1' })
  ).toEqual(err({ type: 'host-disconnect' }));
  expect(await env.apiClient.getBallotImages({ cvrId: 'cvr-1' })).toEqual(
    err({ type: 'host-disconnect' })
  );
  expect(await env.apiClient.getWriteInCandidates()).toEqual(
    err({ type: 'host-disconnect' })
  );
  expect(
    await env.apiClient.adjudicateCvrContest({
      cvrId: 'cvr-1',
      contestId: 'c-1',
      side: 'front',
      adjudicatedContestOptionById: {},
    })
  ).toEqual(err({ type: 'host-disconnect' }));
  expect(await env.apiClient.setCvrResolved({ cvrId: 'cvr-1' })).toEqual(
    err({ type: 'host-disconnect' })
  );
});

test('proxy returns host-disconnect when peer API throws network error', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.claimBallot.mockRejectedValue(new Error('fetch failed'));

  const result = await env.apiClient.claimBallot({});
  expect(result).toEqual(err({ type: 'host-disconnect' }));
});

test('adjudicateCvrContest returns no-claim when host has no claim', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.adjudicateCvrContest.mockResolvedValue(err({ type: 'no-claim' }));

  const result = await env.apiClient.adjudicateCvrContest({
    cvrId: 'cvr-1',
    contestId: 'c-1',
    side: 'front',
    adjudicatedContestOptionById: {},
  });
  expect(result).toEqual(err({ type: 'no-claim' }));
});

test('setCvrResolved returns no-claim when host has no claim', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.setCvrResolved.mockResolvedValue(err({ type: 'no-claim' }));

  const result = await env.apiClient.setCvrResolved({ cvrId: 'cvr-1' });
  expect(result).toEqual(err({ type: 'no-claim' }));
});

test('adjudicateCvrContest returns host-disconnect on network error', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.adjudicateCvrContest.mockRejectedValue(new Error('fetch failed'));

  const result = await env.apiClient.adjudicateCvrContest({
    cvrId: 'cvr-1',
    contestId: 'c-1',
    side: 'front',
    adjudicatedContestOptionById: {},
  });
  expect(result).toEqual(err({ type: 'host-disconnect' }));
});

test('setCvrResolved returns host-disconnect on network error', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.setCvrResolved.mockRejectedValue(new Error('fetch failed'));

  const result = await env.apiClient.setCvrResolved({ cvrId: 'cvr-1' });
  expect(result).toEqual(err({ type: 'host-disconnect' }));
});

test('releaseBallot proxies to host peer API', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.releaseBallot.mockResolvedValue(undefined);

  (await env.apiClient.releaseBallot({ cvrId: 'cvr-1' })).unsafeUnwrap();
  expect(mockPeerApi.releaseBallot).toHaveBeenCalledWith(
    expect.objectContaining({ cvrId: 'cvr-1' })
  );
});

test('getBallotAdjudicationData proxies to host peer API', async () => {
  const { mockPeerApi } = connectToMockHost();
  const mockData = { cvrId: 'cvr-1', contests: [] } as const;
  mockPeerApi.getBallotAdjudicationData.mockResolvedValue(mockData);

  const result = await env.apiClient.getBallotAdjudicationData({
    cvrId: 'cvr-1',
  });
  expect(result).toEqual(ok(mockData));
});

test('getBallotImages fetches metadata via grout and binary images via fetch', async () => {
  const { mockPeerApi } = connectToMockHost();

  const mockMetadata = {
    cvrId: 'cvr-1',
    front: {
      type: 'bmd',
      ballotCoordinates: { x: 0, y: 0, width: 100, height: 200 },
      imageUrl: '/api/ballot-image/cvr-1/front',
    },
    back: {
      type: 'bmd',
      ballotCoordinates: { x: 0, y: 0, width: 100, height: 200 },
      imageUrl: '/api/ballot-image/cvr-1/back',
    },
  } as const;
  mockPeerApi.getBallotImageMetadata.mockResolvedValue(mockMetadata);

  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(pngBytes, {
        headers: { 'content-type': 'image/png' },
      })
    )
  );

  const imagesResult = await env.apiClient.getBallotImages({ cvrId: 'cvr-1' });
  const images = imagesResult.unsafeUnwrap();
  expect(images.cvrId).toEqual('cvr-1');
  expect(images.front.imageUrl).toMatch(/^data:image\/png;base64,/);
  expect(images.back.imageUrl).toMatch(/^data:image\/png;base64,/);
  expect(fetchSpy).toHaveBeenCalledTimes(2);

  fetchSpy.mockRestore();
});

test('getWriteInCandidates proxies to host peer API', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.getWriteInCandidates.mockResolvedValue([]);

  const result = await env.apiClient.getWriteInCandidates();
  expect(result).toEqual(ok([]));
});

test('adjudicateCvrContest proxies to host peer API', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.adjudicateCvrContest.mockResolvedValue(ok());

  (
    await env.apiClient.adjudicateCvrContest({
      cvrId: 'cvr-1',
      contestId: 'contest-1',
      side: 'front',
      adjudicatedContestOptionById: {},
    })
  ).unsafeUnwrap();
  expect(mockPeerApi.adjudicateCvrContest).toHaveBeenCalledWith(
    expect.objectContaining({
      cvrId: 'cvr-1',
      contestId: 'contest-1',
    })
  );
});

test('setCvrResolved proxies to host peer API', async () => {
  const { mockPeerApi } = connectToMockHost();
  mockPeerApi.setCvrResolved.mockResolvedValue(ok());

  (await env.apiClient.setCvrResolved({ cvrId: 'cvr-1' })).unsafeUnwrap();
  expect(mockPeerApi.setCvrResolved).toHaveBeenCalledWith(
    expect.objectContaining({ cvrId: 'cvr-1' })
  );
});
