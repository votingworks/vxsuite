import { AvahiService } from '@votingworks/networking';
import { rootDebug } from './util/debug';
import { NETWORK_POLLING_INTERVAL, PEER_PORT } from './globals';
import {
  VxAdminMachineMode,
  VxAdminNetworkStatus,
  VxAdminClientConnectionStatus,
} from './types';

const debug = rootDebug.extend('networking');

const VXADMIN_SERVICE_TYPE = '_vxadmin._tcp';

export class VxAdminNetworkingManager {
  private readonly machineId: string;
  private mode: VxAdminMachineMode = 'traditional';
  private isPolling = false;
  private pollingInterval: ReturnType<typeof setInterval> | undefined;
  private clientConnectionStatus: VxAdminClientConnectionStatus = {
    status: 'not_connected',
  };

  private isPublishing = false;

  constructor(machineId: string) {
    this.machineId = machineId;
  }

  getNetworkStatus(): VxAdminNetworkStatus {
    switch (this.mode) {
      case 'traditional':
        return { mode: 'traditional' };
      case 'host':
        return {
          mode: 'host',
          isPublishing: this.isPublishing,
          connectedClients: [],
        };
      case 'client':
        return {
          mode: 'client',
          connectionStatus: this.clientConnectionStatus,
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
      case 'traditional':
        break;
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
    this.clientConnectionStatus = { status: 'not_connected' };
    this.isPublishing = false;
  }

  private startHost(): void {
    const serviceName = `VxAdmin-${this.machineId}`;
    debug(
      'Publishing avahi service %s on port %d',
      serviceName,
      PEER_PORT
    );
    AvahiService.advertiseService(
      serviceName,
      PEER_PORT,
      VXADMIN_SERVICE_TYPE
    );
    this.isPublishing = true;
  }

  private stopHost(): void {
    const serviceName = `VxAdmin-${this.machineId}`;
    AvahiService.stopAdvertisedService(serviceName);
    this.isPublishing = false;
  }

  private startClient(): void {
    this.clientConnectionStatus = { status: 'not_connected' };
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

  private async pollForHost(): Promise<void> {
    try {
      const services = await AvahiService.discoverServices(
        VXADMIN_SERVICE_TYPE
      );

      // Filter out our own machine
      const ownServiceName = `VxAdmin-${this.machineId}`;
      const otherServices = services.filter(
        (s) => s.name !== ownServiceName
      );

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
