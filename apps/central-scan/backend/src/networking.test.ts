import { afterEach, beforeEach, expect, Mock, test, vi } from 'vitest';
import { err, ok } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import {
  findAllVxAdminHostMachines,
  hasOnlineInterface,
  NETWORK_POLLING_INTERVAL_MS,
  VxAdminHostMachine,
} from '@votingworks/networking';
import { mockBaseLogger } from '@votingworks/logging';
import { readElectionGeneralDefinition } from '@votingworks/fixtures';
import {
  DEV_MACHINE_ID,
  ElectionDefinition,
  TEST_JURISDICTION,
} from '@votingworks/types';
import { startScannerNetworking } from './networking.js';
import { Store } from './store.js';

vi.mock(import('@votingworks/networking'), async (importActual) => ({
  ...(await importActual()),
  hasOnlineInterface: vi.fn(),
  findAllVxAdminHostMachines: vi.fn(),
}));
vi.mock('@votingworks/grout');

const HOST_MACHINE: VxAdminHostMachine = {
  machineId: '0002',
  address: 'http://192.168.1.10:3002',
};

// A type literal (not an interface) so it's assignable to grout's
// index-signature-based Client type.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type MockHostApiClient = {
  registerScanner: Mock;
  getCurrentElectionMetadata: Mock;
};

function buildMockHostApiClient(): MockHostApiClient {
  return {
    registerScanner: vi.fn().mockResolvedValue(
      ok({
        machineId: HOST_MACHINE.machineId,
        codeVersion: 'dev',
      })
    ),
    getCurrentElectionMetadata: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockHostApiClient(): MockHostApiClient {
  const mockClient = buildMockHostApiClient();
  vi.mocked(grout.createClient).mockReturnValue(mockClient);
  return mockClient;
}

function configureStore(
  store: Store,
  electionDefinition: ElectionDefinition
): void {
  store.setElectionAndJurisdiction({
    electionData: electionDefinition.electionData,
    jurisdiction: TEST_JURISDICTION,
    electionPackageHash: 'test-election-package-hash',
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  vi.mocked(hasOnlineInterface).mockResolvedValue(true);
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

async function advancePollingInterval(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(NETWORK_POLLING_INTERVAL_MS);
}

test('starts in offline status before the first poll', () => {
  vi.mocked(hasOnlineInterface).mockResolvedValue(false);
  const store = Store.memoryStore();
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'offline',
  });
});

test('reports offline when no network interface is online', async () => {
  vi.mocked(hasOnlineInterface).mockResolvedValue(false);
  const store = Store.memoryStore();
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'offline',
  });
  expect(findAllVxAdminHostMachines).not.toHaveBeenCalled();
});

test('reports waiting-for-host when online but no VxAdmin is advertised', async () => {
  const store = Store.memoryStore();
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-waiting-for-host',
  });
});

test('reports multiple-hosts-detected when more than one advertised VxAdmin is reachable', async () => {
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([
    HOST_MACHINE,
    { machineId: '0003', address: 'http://192.168.1.11:3002' },
  ]);
  createMockHostApiClient();
  const store = Store.memoryStore();
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-multiple-hosts-detected',
  });
});

test('ignores a stale advertisement and connects to the single reachable host', async () => {
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([
    // Stale advertisement from a host that is no longer reachable
    { machineId: '0003', address: 'http://192.168.1.11:3002' },
    HOST_MACHINE,
  ]);
  const staleClient = buildMockHostApiClient();
  staleClient.getCurrentElectionMetadata.mockRejectedValue(
    new Error('ECONNREFUSED')
  );
  const reachableClient = buildMockHostApiClient();
  vi.mocked(grout.createClient).mockImplementation(({ baseUrl }) =>
    baseUrl.startsWith(HOST_MACHINE.address) ? reachableClient : staleClient
  );
  const store = Store.memoryStore();
  configureStore(store, readElectionGeneralDefinition());
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-host-detected',
    hostMachineId: '0002',
  });
  expect(staleClient.registerScanner).not.toHaveBeenCalled();
});

test('reports waiting-for-host when no advertised VxAdmin is reachable', async () => {
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([
    HOST_MACHINE,
    { machineId: '0003', address: 'http://192.168.1.11:3002' },
  ]);
  const mockClient = createMockHostApiClient();
  mockClient.getCurrentElectionMetadata.mockRejectedValue(
    new Error('ECONNREFUSED')
  );
  const store = Store.memoryStore();
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-waiting-for-host',
  });
});

test('reports waiting-for-host when the advertised host is unreachable', async () => {
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([HOST_MACHINE]);
  const mockClient = createMockHostApiClient();
  mockClient.registerScanner.mockRejectedValue(new Error('ECONNREFUSED'));
  const store = Store.memoryStore();
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-waiting-for-host',
  });
});

test('reports code-version-mismatch when the host runs a different software version', async () => {
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([HOST_MACHINE]);
  const mockClient = createMockHostApiClient();
  mockClient.registerScanner.mockResolvedValue(
    err({ type: 'code-version-mismatch' })
  );
  const store = Store.memoryStore();
  configureStore(store, readElectionGeneralDefinition());
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-code-version-mismatch',
    hostMachineId: '0002',
  });
});

test('reports machine-unconfigured when this scanner has no election', async () => {
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([HOST_MACHINE]);
  const mockClient = createMockHostApiClient();
  mockClient.registerScanner.mockResolvedValue(
    err({ type: 'scanner-unconfigured' })
  );
  const store = Store.memoryStore();
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-machine-unconfigured',
    hostMachineId: '0002',
  });
  expect(mockClient.registerScanner).toHaveBeenCalledWith({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
    ballotHash: undefined,
  });
});

test('reports host-unconfigured when the host has no election', async () => {
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([HOST_MACHINE]);
  const mockClient = createMockHostApiClient();
  mockClient.registerScanner.mockResolvedValue(
    err({ type: 'host-unconfigured' })
  );
  const store = Store.memoryStore();
  configureStore(store, readElectionGeneralDefinition());
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-host-unconfigured',
    hostMachineId: '0002',
  });
});

test('reports ballot-hash-mismatch when the host is configured for a different election', async () => {
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([HOST_MACHINE]);
  const mockClient = createMockHostApiClient();
  mockClient.registerScanner.mockResolvedValue(
    err({ type: 'ballot-hash-mismatch' })
  );
  const store = Store.memoryStore();
  configureStore(store, readElectionGeneralDefinition());
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-ballot-hash-mismatch',
    hostMachineId: '0002',
  });
});

test('reports host-detected when everything matches', async () => {
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([HOST_MACHINE]);
  const mockClient = createMockHostApiClient();
  const store = Store.memoryStore();
  configureStore(store, readElectionGeneralDefinition());
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-host-detected',
    hostMachineId: '0002',
  });
  expect(mockClient.registerScanner).toHaveBeenCalledWith({
    machineId: DEV_MACHINE_ID,
    codeVersion: 'dev',
    ballotHash: readElectionGeneralDefinition().ballotHash,
  });
});

test('logs status transitions and returns to offline when the interface goes down', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([HOST_MACHINE]);
  createMockHostApiClient();
  const store = Store.memoryStore();
  configureStore(store, readElectionGeneralDefinition());
  startScannerNetworking({ logger, store });
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'online-host-detected',
    hostMachineId: '0002',
  });
  expect(logger.log).toHaveBeenCalledWith(
    expect.anything(),
    'system',
    expect.objectContaining({
      previousStatus: 'offline',
      newStatus: 'online-host-detected',
      hostMachineId: '0002',
    })
  );

  vi.mocked(hasOnlineInterface).mockResolvedValue(false);
  await advancePollingInterval();
  expect(store.getNetworkConnectionInfo()).toEqual({
    status: 'offline',
  });
  expect(logger.log).toHaveBeenCalledWith(
    expect.anything(),
    'system',
    expect.objectContaining({
      previousStatus: 'online-host-detected',
      newStatus: 'offline',
      hostMachineId: 'none',
    })
  );
});
