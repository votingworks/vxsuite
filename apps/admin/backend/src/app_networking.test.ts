import { afterEach, beforeEach, expect, test, vi, vitest } from 'vitest';
import { AvahiService, hasOnlineInterface } from '@votingworks/networking';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
} from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { assertDefined } from '@votingworks/basics';
import {
  startHostNetworking,
  startClientNetworking,
  getHostServiceName,
} from './networking';
import { buildPeerApp } from './peer_app';
import { Store } from './store';
import { HostConnectionStatus, ClientConnectionStatus } from './types';
import { ClientStore } from './client_store';
import { createWorkspace } from './util/workspace';
import {
  NETWORK_POLLING_INTERVAL_MS,
  STALE_MACHINE_THRESHOLD_MS,
} from './globals';
import { getCurrentTime } from './get_current_time';

vi.mock('./get_current_time');

vi.mock('@votingworks/networking', () => ({
  hasOnlineInterface: vi.fn().mockResolvedValue(false),
  isValidIpv4Address: vi.fn().mockReturnValue(true),
  AvahiService: {
    advertiseHttpService: vi.fn().mockReturnValue(undefined),
    discoverHttpServices: vi.fn().mockResolvedValue([]),
  },
}));

const mockHasOnlineInterface = vi.mocked(hasOnlineInterface);
const mockDiscoverHttpServices = vi.mocked(AvahiService.discoverHttpServices);
const mockGetCurrentTime = vi.mocked(getCurrentTime);

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockGetCurrentTime.mockImplementation(() => Date.now());
  mockHasOnlineInterface.mockResolvedValue(false);
  mockDiscoverHttpServices.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

vitest.setConfig({ testTimeout: 20_000 });

function waitFor(
  fn: () => void | Promise<void>,
  timeout = 5000
): Promise<void> {
  return vi.waitFor(fn, { timeout });
}

interface HostAndClientContext {
  store: Store;
  peerServer: Server;
  peerPort: number;
  clientStore: ClientStore;
  auth: ReturnType<typeof buildMockDippedSmartCardAuth>;
}

let peerServer: Server | undefined;

afterEach(async () => {
  if (peerServer) {
    await new Promise<void>((resolve, reject) => {
      peerServer?.close((error) => (error ? reject(error) : resolve()));
    });
    peerServer = undefined;
  }
});

async function setupHostAndClient(
  hostMachineId: string,
  clientMachineId: string
): Promise<HostAndClientContext> {
  const tmpDir = makeTemporaryDirectory();
  const workspace = createWorkspace(tmpDir, mockBaseLogger({ fn: vi.fn }));
  const { store } = workspace;
  const peerApp = buildPeerApp({ workspace });
  peerServer = peerApp.listen();
  const { port: peerPort } = peerServer.address() as AddressInfo;
  const clientStore = new ClientStore();

  mockHasOnlineInterface.mockResolvedValue(true);

  startHostNetworking({ machineId: hostMachineId, peerPort, store });
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  startClientNetworking({ machineId: clientMachineId, clientStore, auth });

  // Allow process.nextTick callbacks to fire so setIntervals get registered
  await vi.advanceTimersByTimeAsync(0);

  mockDiscoverHttpServices.mockResolvedValue([
    {
      name: getHostServiceName(hostMachineId),
      host: 'host.local',
      resolvedIp: '127.0.0.1',
      port: peerPort.toString(),
    },
  ]);

  return { store, peerServer, peerPort, clientStore, auth };
}

test('client discovers host and connects - host stores client info in database', async () => {
  const hostMachineId = 'HOST-001';
  const clientMachineId = 'CLIENT-001';
  const { store, peerPort, clientStore } = await setupHostAndClient(
    hostMachineId,
    clientMachineId
  );

  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);

    const machines = store.getMachines();

    // Host should record itself as connected
    expect(machines.find((m) => m.machineId === hostMachineId)).toMatchObject({
      machineId: hostMachineId,
      machineMode: 'host',
      status: HostConnectionStatus.Connected,
    });

    // Host should record the client via the connectToHost peer API call
    expect(machines.find((m) => m.machineId === clientMachineId)).toMatchObject(
      {
        machineId: clientMachineId,
        machineMode: 'client',
        status: HostConnectionStatus.Connected,
      }
    );
  });

  // Client should also know it's connected to the host
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineConnectedToHost
    );
    expect(clientStore.getHostConnection()).toMatchObject({
      address: `http://127.0.0.1:${peerPort}`,
    });
  });
});

test('client transitions to waiting-for-host when host disappears from avahi', async () => {
  const hostMachineId = 'HOST-002';
  const clientMachineId = 'CLIENT-002';
  const { store, clientStore } = await setupHostAndClient(
    hostMachineId,
    clientMachineId
  );

  // Wait for initial connection (both host-side and client-side)
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(
      store.getMachines().find((m) => m.machineId === clientMachineId)
    ).toMatchObject({ status: HostConnectionStatus.Connected });
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineConnectedToHost
    );
  });

  // Host disappears from avahi discovery
  mockDiscoverHttpServices.mockResolvedValue([]);

  // Client should transition to waiting-for-host
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineWaitingForHost
    );
  });
});

test('host calls cleanupStaleMachines on each polling cycle and cleans stale connections', async () => {
  const hostMachineId = 'HOST-003';
  const clientMachineId = 'CLIENT-003';
  const { store, clientStore } = await setupHostAndClient(
    hostMachineId,
    clientMachineId
  );

  // Wait for client to connect (both host-side and client-side)
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(
      store.getMachines().find((m) => m.machineId === clientMachineId)
    ).toMatchObject({ status: HostConnectionStatus.Connected });
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineConnectedToHost
    );
  });

  // Verify cleanupStaleMachines is called during host polling
  const cleanupSpy = vi.spyOn(store, 'cleanupStaleMachines');
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(cleanupSpy).toHaveBeenCalled();
  });

  // Stop client heartbeats by removing host from avahi
  mockDiscoverHttpServices.mockResolvedValue([]);

  // Wait for the client to fully disconnect before checking stale cleanup,
  // to avoid a race with in-flight connectToHost calls
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineWaitingForHost
    );
  });

  // Advance time past the stale threshold so the next cleanup marks the
  // client as offline. The host re-establishes its own connected status
  // on the same polling cycle, while the client remains offline.
  vi.advanceTimersByTime(STALE_MACHINE_THRESHOLD_MS);
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    const machines = store.getMachines();
    expect(machines.find((m) => m.machineId === hostMachineId)).toMatchObject({
      status: HostConnectionStatus.Connected,
    });
    expect(machines.find((m) => m.machineId === clientMachineId)).toMatchObject(
      { status: HostConnectionStatus.Offline }
    );
  });
});

test('client receives and caches election data from configured host', async () => {
  const hostMachineId = 'HOST-004';
  const clientMachineId = 'CLIENT-004';
  const { store, clientStore } = await setupHostAndClient(
    hostMachineId,
    clientMachineId
  );

  // Configure an election on the host
  const electionDefinition = readElectionGeneralDefinition();
  const electionId = store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: globalThis.Buffer.from('test'),
    electionPackageHash: 'test-hash',
  });
  store.setCurrentElectionId(electionId);

  // Wait for client to connect and cache election data
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineConnectedToHost
    );
    expect(clientStore.getCachedElectionRecord()).toBeDefined();
  });

  const cachedRecord = assertDefined(clientStore.getCachedElectionRecord());
  expect(cachedRecord.electionDefinition.election.title).toEqual(
    electionDefinition.election.title
  );
  expect(clientStore.getCurrentElectionId()).toEqual(cachedRecord.id);
  expect(clientStore.getElectionKey(cachedRecord.id)).toEqual(
    constructElectionKey(electionDefinition.election)
  );
  expect(clientStore.getCachedSystemSettings()).toEqual(
    DEFAULT_SYSTEM_SETTINGS
  );
});

test('client logs out when host election is unconfigured', async () => {
  const hostMachineId = 'HOST-005';
  const clientMachineId = 'CLIENT-005';
  const { store, clientStore, auth } = await setupHostAndClient(
    hostMachineId,
    clientMachineId
  );

  // Configure an election on the host
  const electionDefinition = readElectionGeneralDefinition();
  const electionId = store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: globalThis.Buffer.from('test'),
    electionPackageHash: 'test-hash',
  });
  store.setCurrentElectionId(electionId);

  // Wait for client to connect and cache election data
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(clientStore.getCachedElectionRecord()).toBeDefined();
  });

  // Unconfigure the election on the host
  await store.reset();

  // Wait for client to detect the unconfigured election and log out
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(clientStore.getCachedElectionRecord()).toBeUndefined();
  });

  expect(auth.logOut).toHaveBeenCalled();
});
