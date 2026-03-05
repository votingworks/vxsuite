import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AvahiService, hasOnlineInterface } from '@votingworks/networking';
import { VxAdminNetworkingManager } from './networking';

vi.mock(import('@votingworks/networking'));
const mockAvahiService = vi.mocked(AvahiService);
const mockHasOnlineInterface = vi.mocked(hasOnlineInterface);

describe('VxAdminNetworkingManager', () => {
  let manager: VxAdminNetworkingManager;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    manager = new VxAdminNetworkingManager('0000');
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns host status by default', () => {
    expect(manager.getNetworkStatus()).toEqual({
      mode: 'host',
      isOnline: false,
      isPublishing: false,
      connectedClients: [],
      otherHostsDetected: 0,
    });
  });

  describe('host mode', () => {
    it('publishes avahi host service on start', () => {
      manager.onModeChanged('host');
      expect(mockAvahiService.advertiseService).toHaveBeenCalledWith(
        'VxAdmin-0000',
        expect.any(Number),
        '_vxadmin._tcp'
      );
      expect(manager.getNetworkStatus()).toMatchObject({
        mode: 'host',
        isPublishing: true,
      });
    });

    it('stops avahi host service on stop', () => {
      manager.onModeChanged('host');
      manager.stop();
      expect(mockAvahiService.stopAdvertisedService).toHaveBeenCalledWith(
        'VxAdmin-0000'
      );
      expect(manager.getNetworkStatus()).toMatchObject({
        mode: 'host',
        isPublishing: false,
      });
    });

    it('reports online status when network is available', async () => {
      mockHasOnlineInterface.mockResolvedValue(true);
      mockAvahiService.discoverServices.mockResolvedValue([]);
      manager.onModeChanged('host');
      await vi.advanceTimersByTimeAsync(2500);
      expect(manager.getNetworkStatus()).toMatchObject({
        mode: 'host',
        isOnline: true,
        otherHostsDetected: 0,
      });
    });

    it('reports offline status when network is unavailable', async () => {
      mockHasOnlineInterface.mockResolvedValue(false);
      manager.onModeChanged('host');
      await vi.advanceTimersByTimeAsync(2500);
      expect(manager.getNetworkStatus()).toMatchObject({
        mode: 'host',
        isOnline: false,
        otherHostsDetected: 0,
        connectedClients: [],
      });
    });

    it('detects other hosts on the network', async () => {
      mockHasOnlineInterface.mockResolvedValue(true);
      mockAvahiService.discoverServices.mockImplementation(
        async (serviceType) => {
          if (serviceType === '_vxadmin._tcp') {
            return [
              {
                name: 'VxAdmin-0000',
                host: 'self.local',
                resolvedIp: '192.168.1.1',
                port: '3002',
              },
              {
                name: 'VxAdmin-1234',
                host: 'host1.local',
                resolvedIp: '192.168.1.2',
                port: '3002',
              },
            ];
          }
          return [];
        }
      );
      manager.onModeChanged('host');
      await vi.advanceTimersByTimeAsync(2500);
      expect(manager.getNetworkStatus()).toMatchObject({
        mode: 'host',
        isOnline: true,
        otherHostsDetected: 1,
      });
    });

    it('discovers connected clients', async () => {
      mockHasOnlineInterface.mockResolvedValue(true);
      mockAvahiService.discoverServices.mockImplementation(
        async (serviceType) => {
          if (serviceType === '_vxadmin-client._tcp') {
            return [
              {
                name: 'VxAdminClient-5678',
                host: 'client1.local',
                resolvedIp: '192.168.1.10',
                port: '3002',
              },
            ];
          }
          return [];
        }
      );
      manager.onModeChanged('host');
      await vi.advanceTimersByTimeAsync(2500);
      const status = manager.getNetworkStatus();
      expect(status.mode).toEqual('host');
      if (status.mode === 'host') {
        expect(status.connectedClients).toHaveLength(1);
        expect(status.connectedClients[0]?.machineId).toEqual('5678');
      }
    });

    it('handles hasOnlineInterface errors gracefully', async () => {
      mockHasOnlineInterface.mockRejectedValue(new Error('check failed'));
      manager.onModeChanged('host');
      await vi.advanceTimersByTimeAsync(2500);
      expect(manager.getNetworkStatus()).toMatchObject({
        mode: 'host',
        isOnline: false,
      });
    });
  });

  describe('client mode', () => {
    it('publishes client service on start', () => {
      manager.onModeChanged('client');
      expect(mockAvahiService.advertiseService).toHaveBeenCalledWith(
        'VxAdminClient-0000',
        expect.any(Number),
        '_vxadmin-client._tcp'
      );
    });

    it('stops client service on stop', () => {
      manager.onModeChanged('client');
      manager.stop();
      expect(mockAvahiService.stopAdvertisedService).toHaveBeenCalledWith(
        'VxAdminClient-0000'
      );
    });

    it('returns not_connected initially', () => {
      manager.onModeChanged('client');
      expect(manager.getNetworkStatus()).toEqual({
        mode: 'client',
        isOnline: false,
        connectionStatus: { status: 'not_connected' },
      });
    });

    it('reports offline when network is unavailable', async () => {
      mockHasOnlineInterface.mockResolvedValue(false);
      manager.onModeChanged('client');
      await vi.advanceTimersByTimeAsync(2500);
      expect(manager.getNetworkStatus()).toEqual({
        mode: 'client',
        isOnline: false,
        connectionStatus: { status: 'not_connected' },
      });
    });

    it('discovers a single host and becomes connected', async () => {
      mockHasOnlineInterface.mockResolvedValue(true);
      mockAvahiService.discoverServices.mockResolvedValue([
        {
          name: 'VxAdmin-1234',
          host: 'host1.local',
          resolvedIp: '192.168.1.2',
          port: '3002',
        },
      ]);
      manager.onModeChanged('client');
      await vi.advanceTimersByTimeAsync(2500);
      expect(manager.getNetworkStatus()).toEqual({
        mode: 'client',
        isOnline: true,
        connectionStatus: {
          status: 'connected',
          hostMachineId: '1234',
        },
      });
    });

    it('filters out own machine from discovered services', async () => {
      mockHasOnlineInterface.mockResolvedValue(true);
      mockAvahiService.discoverServices.mockResolvedValue([
        {
          name: 'VxAdmin-0000',
          host: 'self.local',
          resolvedIp: '192.168.1.1',
          port: '3002',
        },
      ]);
      manager.onModeChanged('client');
      await vi.advanceTimersByTimeAsync(2500);
      expect(manager.getNetworkStatus()).toEqual({
        mode: 'client',
        isOnline: true,
        connectionStatus: { status: 'not_connected' },
      });
    });

    it('reports too_many_hosts when multiple hosts found', async () => {
      mockHasOnlineInterface.mockResolvedValue(true);
      mockAvahiService.discoverServices.mockResolvedValue([
        {
          name: 'VxAdmin-1234',
          host: 'host1.local',
          resolvedIp: '192.168.1.2',
          port: '3002',
        },
        {
          name: 'VxAdmin-5678',
          host: 'host2.local',
          resolvedIp: '192.168.1.3',
          port: '3002',
        },
      ]);
      manager.onModeChanged('client');
      await vi.advanceTimersByTimeAsync(2500);
      expect(manager.getNetworkStatus()).toEqual({
        mode: 'client',
        isOnline: true,
        connectionStatus: { status: 'too_many_hosts', hostCount: 2 },
      });
    });

    it('handles discovery errors gracefully', async () => {
      mockHasOnlineInterface.mockResolvedValue(true);
      mockAvahiService.discoverServices.mockRejectedValue(
        new Error('network error')
      );
      manager.onModeChanged('client');
      await vi.advanceTimersByTimeAsync(2500);
      expect(manager.getNetworkStatus()).toEqual({
        mode: 'client',
        isOnline: true,
        connectionStatus: { status: 'not_connected' },
      });
    });
  });

  describe('mode transitions', () => {
    it('stops host service before switching to client', () => {
      manager.onModeChanged('host');
      expect(mockAvahiService.advertiseService).toHaveBeenCalledWith(
        'VxAdmin-0000',
        expect.any(Number),
        '_vxadmin._tcp'
      );
      manager.onModeChanged('client');
      expect(mockAvahiService.stopAdvertisedService).toHaveBeenCalledWith(
        'VxAdmin-0000'
      );
    });

    it('stops client service before switching to host', () => {
      manager.onModeChanged('client');
      expect(mockAvahiService.advertiseService).toHaveBeenCalledWith(
        'VxAdminClient-0000',
        expect.any(Number),
        '_vxadmin-client._tcp'
      );
      manager.onModeChanged('host');
      expect(mockAvahiService.stopAdvertisedService).toHaveBeenCalledWith(
        'VxAdminClient-0000'
      );
    });
  });
});
