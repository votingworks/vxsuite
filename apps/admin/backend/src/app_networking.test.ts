import { afterEach, beforeEach, expect, test, vi, vitest } from 'vitest';
import { AvahiService, hasOnlineInterface } from '@votingworks/networking';
import { AddressInfo } from 'node:net';
import { Server } from 'node:http';
import {
  electionTwoPartyPrimaryFixtures,
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  Admin,
  anyPollingPlace,
  constructElectionKey,
  DEFAULT_SYSTEM_SETTINGS,
  Id,
} from '@votingworks/types';
import { mockBaseLogger } from '@votingworks/logging';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import { assertDefined, err } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import {
  detectMultiUsbDrive,
  SimulatedUsbPlatform,
} from '@votingworks/usb-drive';
import {
  startHostNetworking,
  startClientNetworking,
  getHostServiceName,
} from './networking.js';
import { buildPeerApp } from './peer_app.js';
import type { PeerApi } from './peer_app.js';
import { buildClientApp } from './client_app.js';
import type { ClientApi } from './client_app.js';
import { Store } from './store.js';
import { ClientConnectionStatus } from './types.js';
import { addMockCvrFileToStore } from '../test/mock_cvr_file.js';
import {
  buildMockLogger,
  mockElectionManagerAuth,
  mockMachineLocked,
} from '../test/app.js';

import { ClientStore } from './client_store.js';
import { createClientWorkspace, createWorkspace } from './util/workspace.js';
import {
  NETWORK_POLLING_INTERVAL_MS,
  STALE_MACHINE_THRESHOLD_MS,
} from './globals.js';
import { getCurrentTime } from './get_current_time.js';

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
  clientApiClient: grout.Client<ClientApi>;
  auth: ReturnType<typeof buildMockDippedSmartCardAuth>;
}

let peerServer: Server | undefined;
let clientServer: Server | undefined;

function closeServer(server?: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

afterEach(async () => {
  await closeServer(peerServer);
  peerServer = undefined;
  await closeServer(clientServer);
  clientServer = undefined;
});

async function setupHostAndClient(
  hostMachineId: string,
  clientMachineId: string
): Promise<HostAndClientContext> {
  const tmpDir = makeTemporaryDirectory();
  const logger = mockBaseLogger({ fn: vi.fn });
  const workspace = createWorkspace(tmpDir, logger);
  const { store } = workspace;
  const peerApp = buildPeerApp({ workspace, logger, machineId: hostMachineId });
  peerServer = peerApp.listen();
  const { port: peerPort } = peerServer.address() as AddressInfo;

  const clientWorkspace = createClientWorkspace(makeTemporaryDirectory());
  const { clientStore } = clientWorkspace;
  const auth = buildMockDippedSmartCardAuth(vi.fn);
  const mockLogger = buildMockLogger(auth, clientStore);
  const clientApp = buildClientApp({
    auth,
    workspace: clientWorkspace,
    logger: mockLogger,
    multiUsbDrive: detectMultiUsbDrive({
      logger: mockLogger,
      platform: new SimulatedUsbPlatform(makeTemporaryDirectory()),
    }),
  });
  clientServer = clientApp.listen();
  const { port: clientPort } = clientServer.address() as AddressInfo;
  const clientApiClient = grout.createClient<ClientApi>({
    baseUrl: `http://localhost:${clientPort}/api`,
  });

  mockHasOnlineInterface.mockResolvedValue(true);

  startHostNetworking({ machineId: hostMachineId, peerPort, store, logger });
  startClientNetworking({
    machineId: clientMachineId,
    clientStore,
    auth,
    logger,
  });

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

  return { store, peerServer, peerPort, clientStore, clientApiClient, auth };
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
      status: Admin.ClientMachineStatus.Active,
    });

    // Host should record the client via the connectToHost peer API call
    expect(machines.find((m) => m.machineId === clientMachineId)).toMatchObject(
      {
        machineId: clientMachineId,
        machineMode: 'client',
        status: Admin.ClientMachineStatus.OnlineLocked,
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
    ).toMatchObject({ status: Admin.ClientMachineStatus.OnlineLocked });
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
    ).toMatchObject({ status: Admin.ClientMachineStatus.OnlineLocked });
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
      status: Admin.ClientMachineStatus.Active,
    });
    expect(machines.find((m) => m.machineId === clientMachineId)).toMatchObject(
      { status: Admin.ClientMachineStatus.Offline }
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
  const electionId = await store.addElection({
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
  const electionId = await store.addElection({
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

async function addElectionWithAdjudicableCvrs(
  store: Store,
  count: number
): Promise<{
  electionId: Id;
  cvrIds: Id[];
}> {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const electionId = await store.addElection({
    electionData: electionDefinition.electionData,
    systemSettingsData: JSON.stringify(DEFAULT_SYSTEM_SETTINGS),
    electionPackageFileContents: globalThis.Buffer.from('test'),
    electionPackageHash: 'test-hash',
  });
  store.setCurrentElectionId(electionId);
  store.setIsClientAdjudicationEnabled(true);
  const cvrIds = addMockCvrFileToStore({
    electionId,
    mockCastVoteRecordFile: Array.from({ length: count }, () => ({
      ballotStyleGroupId: '1M',
      batchId: 'batch-1',
      scannerId: 'scanner-1',
      precinctId: 'precinct-1',
      votingMethod: 'precinct',
      votes: { 'zoo-council-mammal': ['write-in-0'] },
      card: { type: 'bmd' },
    })),
    pollingPlaceId: anyPollingPlace(electionDefinition.election).id,
    store,
  });
  return { electionId, cvrIds };
}

// Claims the next available ballot for `machineId` directly on the host
// store. Returns undefined while another machine holds the only ballot.
function claimNextOnHost(
  store: Store,
  electionId: Id,
  machineId: string
): Id | undefined {
  return store.claimAndLoadBallotData({ electionId, machineId }).unsafeUnwrap()
    ?.cvrId;
}

test('a ballot claimed via the peer API is released when the client goes stale', async () => {
  const hostMachineId = 'HOST-006';
  const clientMachineId = 'CLIENT-006';
  const { store, peerPort, clientStore } = await setupHostAndClient(
    hostMachineId,
    clientMachineId
  );
  const { electionId, cvrIds } = await addElectionWithAdjudicableCvrs(store, 1);
  const cvrId = assertDefined(cvrIds[0]);

  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineConnectedToHost
    );
  });

  // The client claims the only adjudicable ballot over the real peer API
  const peerApiClient = grout.createClient<PeerApi>({
    baseUrl: `http://127.0.0.1:${peerPort}/api`,
  });
  const claimed = (
    await peerApiClient.claimAndLoadBallot({
      machineId: clientMachineId,
    })
  ).unsafeUnwrap();
  expect(claimed?.cvrId).toEqual(cvrId);
  expect(claimNextOnHost(store, electionId, 'OTHER-MACHINE')).toBeUndefined();

  // The client stops heartbeating
  mockDiscoverHttpServices.mockResolvedValue([]);
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineWaitingForHost
    );
  });

  // The claim survives a disconnect shorter than the stale threshold
  expect(claimNextOnHost(store, electionId, 'OTHER-MACHINE')).toBeUndefined();

  // Once the client is stale, the host's polling loop releases the claim and
  // another machine can pick up the ballot
  vi.advanceTimersByTime(STALE_MACHINE_THRESHOLD_MS);
  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(claimNextOnHost(store, electionId, 'OTHER-MACHINE')).toEqual(cvrId);
  });
});

test('a client logging out releases its ballot claim on the next heartbeat', async () => {
  const hostMachineId = 'HOST-007';
  const clientMachineId = 'CLIENT-007';
  const { store, peerPort, auth } = await setupHostAndClient(
    hostMachineId,
    clientMachineId
  );
  const { electionId, cvrIds } = await addElectionWithAdjudicableCvrs(store, 1);
  const cvrId = assertDefined(cvrIds[0]);
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  mockElectionManagerAuth(auth, electionDefinition.election);

  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(
      store.getMachines().find((m) => m.machineId === clientMachineId)
    ).toMatchObject({
      status: Admin.ClientMachineStatus.Active,
      authType: 'election_manager',
    });
  });

  const peerApiClient = grout.createClient<PeerApi>({
    baseUrl: `http://127.0.0.1:${peerPort}/api`,
  });
  const claimed = (
    await peerApiClient.claimAndLoadBallot({
      machineId: clientMachineId,
    })
  ).unsafeUnwrap();
  expect(claimed?.cvrId).toEqual(cvrId);
  expect(claimNextOnHost(store, electionId, 'OTHER-MACHINE')).toBeUndefined();

  // Lock the client machine — its next heartbeat reports OnlineLocked, which
  // makes the host release the claim
  mockMachineLocked(auth);

  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(
      store.getMachines().find((m) => m.machineId === clientMachineId)
    ).toMatchObject({ status: Admin.ClientMachineStatus.OnlineLocked });
    expect(claimNextOnHost(store, electionId, 'OTHER-MACHINE')).toEqual(cvrId);
  });
});

test('client app adjudication proxies round-trip to the host over the networked connection', async () => {
  const hostMachineId = 'HOST-008';
  const clientMachineId = 'CLIENT-008';
  const { store, clientStore, clientApiClient } = await setupHostAndClient(
    hostMachineId,
    clientMachineId
  );
  const { electionId, cvrIds } = await addElectionWithAdjudicableCvrs(store, 2);

  await waitFor(() => {
    vi.advanceTimersByTime(NETWORK_POLLING_INTERVAL_MS);
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineConnectedToHost
    );
  });

  // The client claims one ballot; the host then claims and gets the other
  const clientClaim = assertDefined(
    (await clientApiClient.claimAndLoadBallot({})).unsafeUnwrap()
  );
  expect(cvrIds).toContain(clientClaim.cvrId);
  expect(clientClaim.data.isResolved).toEqual(false);

  const hostClaimedCvrId = claimNextOnHost(store, electionId, hostMachineId);
  expect(cvrIds).toContain(hostClaimedCvrId);
  expect(hostClaimedCvrId).not.toEqual(clientClaim.cvrId);

  // Adjudicating the host's ballot as the client fails
  expect(
    await clientApiClient.adjudicateCvr({
      cvrId: assertDefined(hostClaimedCvrId),
      contests: [],
    })
  ).toEqual(err({ type: 'claim-failed' }));

  expect(
    (
      await clientApiClient.getWriteInCandidates({
        contestIds: ['zoo-council-mammal'],
      })
    ).unsafeUnwrap()
  ).toEqual([]);

  // Adjudicating the client's own ballot succeeds; with the other ballot
  // still held by the host, there is nothing left to claim
  (
    await clientApiClient.adjudicateCvr({
      cvrId: clientClaim.cvrId,
      contests: [],
    })
  ).unsafeUnwrap();
  expect(
    (await clientApiClient.claimAndLoadBallot({})).unsafeUnwrap()
  ).toBeUndefined();

  // Once the host releases its ballot, the client can claim, release, and
  // re-claim it through the proxy
  store.releaseBallotClaim({
    electionId,
    cvrId: assertDefined(hostClaimedCvrId),
  });
  const reclaim = assertDefined(
    (await clientApiClient.claimAndLoadBallot({})).unsafeUnwrap()
  );
  expect(reclaim.cvrId).toEqual(hostClaimedCvrId);

  (
    await clientApiClient.releaseBallot({ cvrId: reclaim.cvrId })
  ).unsafeUnwrap();
  expect(
    store.getNextCvrIdForBallotAdjudication({
      electionId,
      machineId: 'OTHER-MACHINE',
    })
  ).toEqual(hostClaimedCvrId);

  // Claim it back and finish the queue
  const finalClaim = assertDefined(
    (await clientApiClient.claimAndLoadBallot({})).unsafeUnwrap()
  );
  (
    await clientApiClient.adjudicateCvr({
      cvrId: finalClaim.cvrId,
      contests: [],
    })
  ).unsafeUnwrap();
  expect(
    store.getNextCvrIdForBallotAdjudication({
      electionId,
      machineId: 'OTHER-MACHINE',
    })
  ).toBeUndefined();
});
