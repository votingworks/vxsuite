import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  AvahiService,
  hasOnlineInterface,
  isValidIpv4Address,
} from '@votingworks/networking';
import * as grout from '@votingworks/grout';
import { buildMockDippedSmartCardAuth } from '@votingworks/auth';
import {
  makeTemporaryDirectory,
  readElectionGeneralDefinition,
} from '@votingworks/fixtures';
import {
  mockElectionManagerUser,
  mockSessionExpiresAt,
} from '@votingworks/test-utils';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import {
  getHostServiceName,
  startHostNetworking,
  startClientNetworking,
} from './networking';
import type { PeerApi } from './peer_app';
import { Store } from './store';
import { MachineStatus, ClientConnectionStatus } from './types';
import { ClientStore } from './client_store';
import { getCurrentTime } from './get_current_time';

vi.mock('./get_current_time');
vi.mock('@votingworks/networking');
vi.mock('@votingworks/grout');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.mocked(getCurrentTime).mockImplementation(() => Date.now());
  vi.mocked(isValidIpv4Address).mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function advancePollingInterval(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(2000);
}

describe('getHostServiceName', () => {
  test('returns expected service name format', () => {
    expect(getHostServiceName('0000')).toEqual('VxAdmin-0000');
    expect(getHostServiceName('machine-123')).toEqual('VxAdmin-machine-123');
  });
});

describe('startHostNetworking', () => {
  test('advertises avahi service', () => {
    const store = Store.memoryStore(makeTemporaryDirectory());
    startHostNetworking({ machineId: '0001', peerPort: 3002, store });

    expect(AvahiService.advertiseHttpService).toHaveBeenCalledWith(
      'VxAdmin-0001',
      3002
    );
  });

  test('writes connected status to store when online', async () => {
    const store = Store.memoryStore(makeTemporaryDirectory());
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    startHostNetworking({ machineId: '0001', peerPort: 3002, store });
    await advancePollingInterval();

    const machines = store.getMachines();
    expect(machines).toHaveLength(1);
    expect(machines[0]).toMatchObject({
      machineId: '0001',
      machineMode: 'host',
      status: MachineStatus.Active,
    });
  });

  test('writes offline status to store when network goes down', async () => {
    const store = Store.memoryStore(makeTemporaryDirectory());
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    startHostNetworking({ machineId: '0001', peerPort: 3002, store });
    await advancePollingInterval();
    expect(store.getMachines()[0]?.status).toEqual(MachineStatus.Active);

    vi.mocked(hasOnlineInterface).mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getMachines()[0]?.status).toEqual(MachineStatus.Offline);
  });
});

describe('startClientNetworking', () => {
  function createClientStore(): ClientStore {
    return new ClientStore();
  }

  function createMockAuth() {
    return buildMockDippedSmartCardAuth(vi.fn);
  }

  interface MockPeerClientOverrides {
    connectToHost?: ReturnType<typeof vi.fn>;
    getElectionPackageHash?: ReturnType<typeof vi.fn>;
    getCurrentElectionMetadata?: ReturnType<typeof vi.fn>;
    getSystemSettings?: ReturnType<typeof vi.fn>;
  }

  function createMockPeerClient(
    overrides: MockPeerClientOverrides = {}
  ): grout.Client<PeerApi> {
    const defaults: MockPeerClientOverrides = {
      connectToHost: vi.fn().mockResolvedValue({
        machineId: 'HOST1',
        codeVersion: 'dev',
        isClientAdjudicationEnabled: false,
      }),
      getElectionPackageHash: vi.fn().mockResolvedValue(undefined),
      getCurrentElectionMetadata: vi.fn().mockResolvedValue(undefined),
      getSystemSettings: vi.fn().mockResolvedValue(undefined),
    };
    return Object.assign(
      defaults,
      overrides
    ) as unknown as grout.Client<PeerApi>;
  }

  test('stores offline status initially', () => {
    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0001',
      clientStore,
      auth: createMockAuth(),
    });
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.Offline
    );
  });

  test('stores online-waiting-for-host when online but no hosts', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([]);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0001a',
      clientStore,
      auth: createMockAuth(),
    });
    await advancePollingInterval();

    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineWaitingForHost
    );
  });

  test('stores online-connected-to-host after successful connection', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);
    const mockClient = createMockPeerClient();
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0001b',
      clientStore,
      auth: createMockAuth(),
    });
    await advancePollingInterval();

    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineConnectedToHost
    );
    expect(clientStore.getHostConnection()).toMatchObject({
      address: 'http://192.168.1.10:3002',
      machineId: 'HOST1',
    });
  });

  test('stores offline when network goes down', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([]);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0001c',
      clientStore,
      auth: createMockAuth(),
    });
    await advancePollingInterval();
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineWaitingForHost
    );

    vi.mocked(hasOnlineInterface).mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.Offline
    );
  });

  test('discovers hosts and connects', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);
    const mockClient = createMockPeerClient();
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0002',
      clientStore,
      auth: createMockAuth(),
    });
    await advancePollingInterval();

    expect(mockClient.connectToHost).toHaveBeenCalledWith({
      machineId: '0002',
      status: MachineStatus.OnlineLocked,
      authType: null,
    });
  });

  test('sends active status and auth type when logged in', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);
    const mockClient = createMockPeerClient();
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    const auth = createMockAuth();
    vi.mocked(auth.getAuthStatus).mockResolvedValue({
      status: 'logged_in',
      user: mockElectionManagerUser(),
      sessionExpiresAt: mockSessionExpiresAt(),
    });

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0002b',
      clientStore,
      auth,
    });
    await advancePollingInterval();

    expect(mockClient.connectToHost).toHaveBeenCalledWith({
      machineId: '0002b',
      status: MachineStatus.Active,
      authType: 'election_manager',
    });
  });

  test('skips discovery when no online interface', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(false);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0003',
      clientStore,
      auth: createMockAuth(),
    });
    await advancePollingInterval();

    expect(hasOnlineInterface).toHaveBeenCalled();
    expect(AvahiService.discoverHttpServices).not.toHaveBeenCalled();
  });

  test('handles no hosts found', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([]);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0004',
      clientStore,
      auth: createMockAuth(),
    });
    await advancePollingInterval();

    expect(AvahiService.discoverHttpServices).toHaveBeenCalled();
    expect(grout.createClient).not.toHaveBeenCalled();
  });

  test('skips hosts with invalid IP addresses', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: 'invalid',
        port: '3002',
      },
    ]);
    vi.mocked(isValidIpv4Address).mockReturnValue(false);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0005',
      clientStore,
      auth: createMockAuth(),
    });
    await advancePollingInterval();

    expect(grout.createClient).not.toHaveBeenCalled();
  });

  test('filters out non-VxAdmin services', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'OtherService-123',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0006',
      clientStore,
      auth: createMockAuth(),
    });
    await advancePollingInterval();

    expect(grout.createClient).not.toHaveBeenCalled();
  });

  test('performs heartbeat on already-connected host', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);
    const mockClient = createMockPeerClient();
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0007',
      clientStore,
      auth: createMockAuth(),
    });

    // First poll: connect
    await advancePollingInterval();
    expect(mockClient.connectToHost).toHaveBeenCalledTimes(1);

    // Second poll: heartbeat via connectToHost
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockClient.connectToHost).toHaveBeenCalledTimes(2);
  });

  test('disconnects when heartbeat fails', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);
    const mockClient = createMockPeerClient({
      connectToHost: vi
        .fn()
        .mockResolvedValueOnce({ machineId: 'HOST1', codeVersion: 'dev' })
        .mockRejectedValue(new Error('connection lost')),
    });
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0008',
      clientStore,
      auth: createMockAuth(),
    });

    // First poll: connect
    await advancePollingInterval();

    // Second poll: heartbeat fails, should disconnect
    await vi.advanceTimersByTimeAsync(2000);

    // Third poll: should try to reconnect (createClient called again)
    const newMockClient = {
      connectToHost: vi.fn().mockResolvedValue({
        machineId: 'HOST1',
        codeVersion: 'dev',
        isClientAdjudicationEnabled: false,
      }),
    } as unknown as grout.Client<PeerApi>;
    vi.mocked(grout.createClient).mockReturnValue(newMockClient);
    await vi.advanceTimersByTimeAsync(2000);
    expect(newMockClient.connectToHost).toHaveBeenCalled();
  });

  test('handles connection failure to new host', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);
    const mockClient = createMockPeerClient({
      connectToHost: vi.fn().mockRejectedValue(new Error('connection refused')),
    });
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0009',
      clientStore,
      auth: createMockAuth(),
    });
    await advancePollingInterval();

    expect(mockClient.connectToHost).toHaveBeenCalled();
  });

  test('clears connected host when host disappears', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    const mockClient = createMockPeerClient();
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    // First poll: host present, connect
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);

    const clientStore = createClientStore();
    startClientNetworking({
      machineId: '0010',
      clientStore,
      auth: createMockAuth(),
    });
    await advancePollingInterval();
    expect(mockClient.connectToHost).toHaveBeenCalledTimes(1);

    // Second poll: host gone
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([]);
    await vi.advanceTimersByTimeAsync(2000);

    // Third poll: host reappears, should reconnect
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockClient.connectToHost).toHaveBeenCalledTimes(2);
  });

  test('does not repeatedly log out when host is unconfigured', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);
    // Host has no election — getElectionPackageHash returns null
    const mockClient = createMockPeerClient();
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    const clientStore = createClientStore();
    const auth = createMockAuth();
    startClientNetworking({ machineId: '0011', clientStore, auth });

    // First poll: connects, sees no election
    await advancePollingInterval();
    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineConnectedToHost
    );

    // Second poll: still no election — should NOT call logOut again
    await vi.advanceTimersByTimeAsync(2000);
    // Third poll
    await vi.advanceTimersByTimeAsync(2000);

    expect(auth.logOut).not.toHaveBeenCalled();
  });

  test('does not cache election when hash exists but metadata is missing', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);
    // Hash returns a value but metadata returns undefined (race condition
    // where election was unconfigured between the two calls)
    const mockClient = createMockPeerClient({
      getElectionPackageHash: vi.fn().mockResolvedValue('some-hash'),
      getCurrentElectionMetadata: vi.fn().mockResolvedValue(undefined),
      getSystemSettings: vi.fn().mockResolvedValue(undefined),
    });
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    const clientStore = createClientStore();
    const auth = createMockAuth();
    startClientNetworking({ machineId: '0012', clientStore, auth });
    await advancePollingInterval();

    expect(clientStore.getConnectionStatus()).toEqual(
      ClientConnectionStatus.OnlineConnectedToHost
    );
    expect(clientStore.getCachedElectionRecord()).toBeUndefined();
    expect(clientStore.getCachedSystemSettings()).toBeUndefined();
    expect(auth.logOut).not.toHaveBeenCalled();
  });

  test('logs out and clears cache when host transitions from configured to unconfigured', async () => {
    const electionDefinition = readElectionGeneralDefinition();
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);

    const mockGetHash = vi.fn().mockResolvedValue('hash-1');
    const mockClient = createMockPeerClient({
      getElectionPackageHash: mockGetHash,
      getCurrentElectionMetadata: vi.fn().mockResolvedValue({
        id: 'election-1',
        electionDefinition,
        createdAt: new Date().toISOString(),
        isOfficialResults: false,
        electionPackageHash: 'hash-1',
      }),
      getSystemSettings: vi.fn().mockResolvedValue(DEFAULT_SYSTEM_SETTINGS),
    });
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    const clientStore = createClientStore();
    const auth = createMockAuth();
    startClientNetworking({ machineId: '0013', clientStore, auth });

    // First poll: connects and caches election
    await advancePollingInterval();
    expect(clientStore.getCachedElectionRecord()).toBeDefined();

    // Host unconfigures — hash now returns undefined
    mockGetHash.mockResolvedValue(undefined);

    // Second poll: detects unconfigured, clears cache and logs out
    await vi.advanceTimersByTimeAsync(2000);
    expect(clientStore.getCachedElectionRecord()).toBeUndefined();
    expect(clientStore.getCachedSystemSettings()).toBeUndefined();
    expect(auth.logOut).toHaveBeenCalled();
  });
});
