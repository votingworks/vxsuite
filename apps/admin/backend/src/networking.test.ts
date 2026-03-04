import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AvahiService } from '@votingworks/networking';
import { VxAdminNetworkingManager } from './networking';

vi.mock(import('@votingworks/networking'));
const mockAvahiService = vi.mocked(AvahiService);

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

  it('returns traditional status by default', () => {
    expect(manager.getNetworkStatus()).toEqual({ mode: 'traditional' });
  });

  describe('host mode', () => {
    it('publishes avahi service on start', () => {
      manager.onModeChanged('host');
      expect(mockAvahiService.advertiseService).toHaveBeenCalledWith(
        'VxAdmin-0000',
        expect.any(Number),
        '_vxadmin._tcp'
      );
      expect(manager.getNetworkStatus()).toEqual({
        mode: 'host',
        isPublishing: true,
        connectedClients: [],
      });
    });

    it('stops avahi service on stop', () => {
      manager.onModeChanged('host');
      manager.stop();
      expect(mockAvahiService.stopAdvertisedService).toHaveBeenCalledWith(
        'VxAdmin-0000'
      );
      expect(manager.getNetworkStatus()).toEqual({
        mode: 'host',
        isPublishing: false,
        connectedClients: [],
      });
    });
  });

  describe('client mode', () => {
    it('returns not_connected initially', () => {
      manager.onModeChanged('client');
      expect(manager.getNetworkStatus()).toEqual({
        mode: 'client',
        connectionStatus: { status: 'not_connected' },
      });
    });

    it('discovers a single host and becomes connected', async () => {
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
        connectionStatus: {
          status: 'connected',
          hostMachineId: '1234',
        },
      });
    });

    it('filters out own machine from discovered services', async () => {
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
        connectionStatus: { status: 'not_connected' },
      });
    });

    it('reports too_many_hosts when multiple hosts found', async () => {
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
        connectionStatus: { status: 'too_many_hosts', hostCount: 2 },
      });
    });

    it('handles discovery errors gracefully', async () => {
      mockAvahiService.discoverServices.mockRejectedValue(
        new Error('network error')
      );
      manager.onModeChanged('client');
      await vi.advanceTimersByTimeAsync(2500);
      expect(manager.getNetworkStatus()).toEqual({
        mode: 'client',
        connectionStatus: { status: 'not_connected' },
      });
    });
  });

  describe('mode transitions', () => {
    it('stops host before switching to client', () => {
      manager.onModeChanged('host');
      expect(mockAvahiService.advertiseService).toHaveBeenCalled();
      manager.onModeChanged('client');
      expect(mockAvahiService.stopAdvertisedService).toHaveBeenCalledWith(
        'VxAdmin-0000'
      );
    });

    it('stops polling before switching to traditional', async () => {
      mockAvahiService.discoverServices.mockResolvedValue([]);
      manager.onModeChanged('client');
      await vi.advanceTimersByTimeAsync(2500);
      manager.onModeChanged('traditional');
      expect(manager.getNetworkStatus()).toEqual({ mode: 'traditional' });
    });
  });
});
