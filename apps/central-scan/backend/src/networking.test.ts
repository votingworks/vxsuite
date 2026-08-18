import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  findAllVxAdminHostMachines,
  hasOnlineInterface,
} from '@votingworks/networking';
import { mockBaseLogger } from '@votingworks/logging';
import { startScannerNetworking } from './networking.js';
import { NETWORK_POLLING_INTERVAL_MS } from './globals.js';
import { Store } from './store.js';

vi.mock(import('@votingworks/networking'), async (importActual) => ({
  ...(await importActual()),
  hasOnlineInterface: vi.fn(),
  findAllVxAdminHostMachines: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
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
  expect(store.getScannerConnectionInfo()).toEqual({
    status: 'offline',
  });
});

test('reports offline when no network interface is online', async () => {
  vi.mocked(hasOnlineInterface).mockResolvedValue(false);
  const store = Store.memoryStore();
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getScannerConnectionInfo()).toEqual({
    status: 'offline',
  });
  expect(findAllVxAdminHostMachines).not.toHaveBeenCalled();
});

test('reports waiting-for-host when online but no VxAdmin is advertised', async () => {
  vi.mocked(hasOnlineInterface).mockResolvedValue(true);
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([]);
  const store = Store.memoryStore();
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getScannerConnectionInfo()).toEqual({
    status: 'online-waiting-for-host',
  });
});

test('reports host-detected with the host machine ID', async () => {
  vi.mocked(hasOnlineInterface).mockResolvedValue(true);
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([
    { machineId: '0002', address: 'http://192.168.1.10:3002' },
  ]);
  const store = Store.memoryStore();
  startScannerNetworking({ logger: mockBaseLogger({ fn: vi.fn }), store });
  await advancePollingInterval();
  expect(store.getScannerConnectionInfo()).toEqual({
    status: 'online-host-detected',
    hostMachineId: '0002',
  });
});

test('logs status transitions and returns to offline when the interface goes down', async () => {
  const logger = mockBaseLogger({ fn: vi.fn });
  vi.mocked(hasOnlineInterface).mockResolvedValue(true);
  vi.mocked(findAllVxAdminHostMachines).mockResolvedValue([
    { machineId: '0002', address: 'http://192.168.1.10:3002' },
  ]);
  const store = Store.memoryStore();
  startScannerNetworking({ logger, store });
  await advancePollingInterval();
  expect(store.getScannerConnectionInfo()).toEqual({
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
  expect(store.getScannerConnectionInfo()).toEqual({
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
