import { AvahiService, hasOnlineInterface } from '@votingworks/networking';
import { rootDebug } from './util/debug';
import { NETWORK_POLLING_INTERVAL, PEER_PORT } from './globals';
import {
  VxAdminMachineMode,
  VxAdminNetworkStatus,
  VxAdminClientConnectionStatus,
} from './types';

const debug = rootDebug.extend('networking');

const VXADMIN_HOST_SERVICE_TYPE = '_vxadmin._tcp';
const VXADMIN_CLIENT_SERVICE_TYPE = '_vxadmin-client._tcp';

export class VxAdminNetworkingManager {
  private readonly machineId: string;
  private mode: VxAdminMachineMode = 'host';
  private isPolling = false;
  private pollingInterval: ReturnType<typeof setInterval> | undefined;
  private clientConnectionStatus: VxAdminClientConnectionStatus = {
    status: 'not_connected',
  };

  private isPublishing = false;
  private isOnline = false;
  private otherHostCount = 0;
  private connectedClients: Array<{ machineId: string; lastSeen: string }> = [];

  constructor(machineId: string) {
    this.machineId = machineId;
  }

  getNetworkStatus(): VxAdminNetworkStatus {
    switch (this.mode) {
      case 'host':
        return {
          mode: 'host',
          isOnline: this.isOnline,
          isPublishing: this.isPublishing,
          connectedClients: this.connectedClients,
          otherHostsDetected: this.otherHostCount,
        };
      case 'client':
        return {
          mode: 'client',
          isOnline: this.isOnline,
          connectionStatus: this.isOnline
            ? this.clientConnectionStatus
            : { status: 'not_connected' },
        };
    }
  }

  onModeChanged(mode: VxAdminMachineMode): void {
    this.stop();
    this.mode = mode;
    this.start();
  }

  start(): void {
    switch (this.mode) {
      case 'host':
        this.startHost();
        break;
      case 'client':
        this.startClient();
        break;
    }
  }

  stop(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
    }
    if (this.mode === 'host') {
      this.stopHost();
    }
    if (this.mode === 'client') {
      this.stopClient();
    }
    this.clientConnectionStatus = { status: 'not_connected' };
    this.isPublishing = false;
    this.isOnline = false;
    this.otherHostCount = 0;
    this.connectedClients = [];
  }

  private hostServiceName(): string {
    return `VxAdmin-${this.machineId}`;
  }

  private clientServiceName(): string {
    return `VxAdminClient-${this.machineId}`;
  }

  private startHost(): void {
    const serviceName = this.hostServiceName();
    debug(
      'Publishing avahi host service %s on port %d',
      serviceName,
      PEER_PORT
    );
    AvahiService.advertiseService(
      serviceName,
      PEER_PORT,
      VXADMIN_HOST_SERVICE_TYPE
    );
    this.isPublishing = true;

    this.pollingInterval = setInterval(async () => {
      if (this.isPolling) {
        return;
      }
      this.isPolling = true;
      try {
        await this.pollHostStatus();
      } finally {
        this.isPolling = false;
      }
    }, NETWORK_POLLING_INTERVAL);
  }

  private stopHost(): void {
    AvahiService.stopAdvertisedService(this.hostServiceName());
    this.isPublishing = false;
  }

  private async pollHostStatus(): Promise<void> {
    try {
      this.isOnline = await hasOnlineInterface();
    } catch {
      this.isOnline = false;
    }

    if (!this.isOnline) {
      this.otherHostCount = 0;
      this.connectedClients = [];
      return;
    }

    // Discover other hosts
    try {
      const services = await AvahiService.discoverServices(
        VXADMIN_HOST_SERVICE_TYPE
      );
      const ownName = this.hostServiceName();
      const otherHosts = services.filter((s) => s.name !== ownName);
      this.otherHostCount = otherHosts.length;
    } catch (error) {
      debug(`Error discovering other hosts: ${error}`);
      this.otherHostCount = 0;
    }

    // Discover connected clients
    try {
      const clientServices = await AvahiService.discoverServices(
        VXADMIN_CLIENT_SERVICE_TYPE
      );
      const now = new Date().toISOString();
      this.connectedClients = clientServices.map((s) => ({
        machineId: s.name.replace('VxAdminClient-', ''),
        lastSeen: now,
      }));
    } catch (error) {
      debug(`Error discovering clients: ${error}`);
      this.connectedClients = [];
    }
  }

  private startClient(): void {
    this.clientConnectionStatus = { status: 'not_connected' };

    // Publish client service so hosts can discover us
    const serviceName = this.clientServiceName();
    debug('Publishing avahi client service %s on port %d', serviceName, PEER_PORT);
    AvahiService.advertiseService(
      serviceName,
      PEER_PORT,
      VXADMIN_CLIENT_SERVICE_TYPE
    );

    this.pollingInterval = setInterval(async () => {
      if (this.isPolling) {
        return;
      }
      this.isPolling = true;
      try {
        await this.pollForHost();
      } finally {
        this.isPolling = false;
      }
    }, NETWORK_POLLING_INTERVAL);
  }

  private stopClient(): void {
    AvahiService.stopAdvertisedService(this.clientServiceName());
  }

  private async pollForHost(): Promise<void> {
    try {
      this.isOnline = await hasOnlineInterface();
    } catch {
      this.isOnline = false;
    }

    if (!this.isOnline) {
      this.clientConnectionStatus = { status: 'not_connected' };
      return;
    }

    try {
      const services = await AvahiService.discoverServices(
        VXADMIN_HOST_SERVICE_TYPE
      );

      // Filter out our own machine (shouldn't be publishing host service as
      // client, but filter defensively)
      const ownHostName = this.hostServiceName();
      const otherServices = services.filter((s) => s.name !== ownHostName);

      if (otherServices.length === 0) {
        this.clientConnectionStatus = { status: 'not_connected' };
      } else if (otherServices.length === 1) {
        const hostService = otherServices[0];
        const hostMachineId =
          hostService?.name.replace('VxAdmin-', '') ?? 'unknown';
        this.clientConnectionStatus = {
          status: 'connected',
          hostMachineId,
        };
      } else {
        this.clientConnectionStatus = {
          status: 'too_many_hosts',
          hostCount: otherServices.length,
        };
      }
    } catch (error) {
      debug(`Error polling for host: ${error}`);
      this.clientConnectionStatus = { status: 'not_connected' };
    }
  }
}
