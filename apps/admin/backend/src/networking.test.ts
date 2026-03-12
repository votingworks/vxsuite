import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  AvahiService,
  hasOnlineInterface,
  isValidIpv4Address,
} from '@votingworks/networking';
import * as grout from '@votingworks/grout';
import {
  getHostServiceName,
  startHostNetworking,
  startClientNetworking,
} from './networking';
import type { PeerApi } from './peer_app';

vi.mock('@votingworks/networking');
vi.mock('@votingworks/grout');

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
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
    startHostNetworking({ machineId: '0001', peerPort: 3002 });

    expect(AvahiService.advertiseHttpService).toHaveBeenCalledWith(
      'VxAdmin-0001',
      3002
    );
  });

  test('returns offline status initially', () => {
    const getStatus = startHostNetworking({ machineId: '0001', peerPort: 3002 });
    expect(getStatus()).toEqual('offline');
  });

  test('returns online when network is up', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    const getStatus = startHostNetworking({ machineId: '0001', peerPort: 3002 });
    await advancePollingInterval();
    expect(getStatus()).toEqual('online');
  });

  test('returns offline when network goes down', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    const getStatus = startHostNetworking({ machineId: '0001', peerPort: 3002 });
    await advancePollingInterval();
    expect(getStatus()).toEqual('online');

    vi.mocked(hasOnlineInterface).mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(getStatus()).toEqual('offline');
  });
});

describe('startClientNetworking', () => {
  test('returns offline status initially', () => {
    const getConnectionStatus = startClientNetworking({
      machineId: '0001',
    });
    expect(getConnectionStatus()).toEqual({ status: 'offline' });
  });

  test('returns online-waiting-for-host when online but no hosts', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([]);

    const getConnectionStatus = startClientNetworking({
      machineId: '0001a',
    });
    await advancePollingInterval();

    expect(getConnectionStatus()).toEqual({
      status: 'online-waiting-for-host',
    });
  });

  test('returns online-connected-to-host after successful connection', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([
      {
        name: 'VxAdmin-HOST1',
        host: 'host.local',
        resolvedIp: '192.168.1.10',
        port: '3002',
      },
    ]);
    const mockClient = {
      connectToHost: vi.fn().mockResolvedValue({ status: 'ok' }),
      getHostMachineConfig: vi
        .fn()
        .mockResolvedValue({ machineId: 'HOST1', codeVersion: 'dev' }),
    } as unknown as grout.Client<PeerApi>;
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    const getConnectionStatus = startClientNetworking({
      machineId: '0001b',
    });
    await advancePollingInterval();

    expect(getConnectionStatus()).toEqual({
      status: 'online-connected-to-host',
      hostMachineId: 'HOST1',
    });
  });

  test('returns offline when network goes down', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([]);

    const getConnectionStatus = startClientNetworking({
      machineId: '0001c',
    });
    await advancePollingInterval();
    expect(getConnectionStatus()).toEqual({
      status: 'online-waiting-for-host',
    });

    vi.mocked(hasOnlineInterface).mockResolvedValue(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(getConnectionStatus()).toEqual({ status: 'offline' });
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
    const mockClient = {
      connectToHost: vi.fn().mockResolvedValue({ status: 'ok' }),
      getHostMachineConfig: vi
        .fn()
        .mockResolvedValue({ machineId: 'HOST1', codeVersion: 'dev' }),
    } as unknown as grout.Client<PeerApi>;
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    startClientNetworking({ machineId: '0002' });
    await advancePollingInterval();

    expect(mockClient.connectToHost).toHaveBeenCalledWith({
      machineId: '0002',
    });
  });

  test('skips discovery when no online interface', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(false);

    startClientNetworking({ machineId: '0003' });
    await advancePollingInterval();

    expect(hasOnlineInterface).toHaveBeenCalled();
    expect(AvahiService.discoverHttpServices).not.toHaveBeenCalled();
  });

  test('handles no hosts found', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    vi.mocked(AvahiService.discoverHttpServices).mockResolvedValue([]);

    startClientNetworking({ machineId: '0004' });
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

    startClientNetworking({ machineId: '0005' });
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

    startClientNetworking({ machineId: '0006' });
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
    const mockClient = {
      connectToHost: vi.fn().mockResolvedValue({ status: 'ok' }),
      getHostMachineConfig: vi.fn().mockResolvedValue({ machineId: 'HOST1' }),
    } as unknown as grout.Client<PeerApi>;
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    startClientNetworking({ machineId: '0007' });

    // First poll: connect
    await advancePollingInterval();
    expect(mockClient.connectToHost).toHaveBeenCalledTimes(1);

    // Second poll: heartbeat
    await vi.advanceTimersByTimeAsync(2000);
    expect(mockClient.getHostMachineConfig).toHaveBeenCalled();
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
    const mockClient = {
      connectToHost: vi.fn().mockResolvedValue({ status: 'ok' }),
      getHostMachineConfig: vi
        .fn()
        .mockResolvedValueOnce({ machineId: 'HOST1', codeVersion: 'dev' })
        .mockRejectedValue(new Error('connection lost')),
    } as unknown as grout.Client<PeerApi>;
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    startClientNetworking({ machineId: '0008' });

    // First poll: connect
    await advancePollingInterval();

    // Second poll: heartbeat fails, should disconnect
    await vi.advanceTimersByTimeAsync(2000);

    // Third poll: should try to reconnect (createClient called again)
    const newMockClient = {
      connectToHost: vi.fn().mockResolvedValue({ status: 'ok' }),
      getHostMachineConfig: vi
        .fn()
        .mockResolvedValue({ machineId: 'HOST1', codeVersion: 'dev' }),
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
    const mockClient = {
      connectToHost: vi.fn().mockRejectedValue(new Error('connection refused')),
      getHostMachineConfig: vi.fn(),
    } as unknown as grout.Client<PeerApi>;
    vi.mocked(grout.createClient).mockReturnValue(mockClient);

    startClientNetworking({ machineId: '0009' });
    await advancePollingInterval();

    expect(mockClient.connectToHost).toHaveBeenCalled();
  });

  test('clears connected host when host disappears', async () => {
    vi.mocked(hasOnlineInterface).mockResolvedValue(true);
    const mockClient = {
      connectToHost: vi.fn().mockResolvedValue({ status: 'ok' }),
      getHostMachineConfig: vi
        .fn()
        .mockResolvedValue({ machineId: 'HOST1', codeVersion: 'dev' }),
    } as unknown as grout.Client<PeerApi>;
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

    startClientNetworking({ machineId: '0010' });
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
});
