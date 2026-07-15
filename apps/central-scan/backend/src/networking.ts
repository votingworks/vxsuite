import type { PeerApi } from '@votingworks/admin-backend';
import { deepEqual } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import {
  AvahiService,
  hasOnlineInterface,
  isValidIpv4Address,
} from '@votingworks/networking';
import makeDebug from 'debug';
import {
  ADMIN_HOST_ADDRESS_OVERRIDE,
  HOST_DISCONNECT_FAILURE_THRESHOLD,
  NETWORK_POLLING_INTERVAL_MS,
  NETWORK_REQUEST_TIMEOUT_MS,
} from './globals';
import { getMachineConfig } from './machine_config';
import { HostConnectionInfo } from './types';

const debug = makeDebug('scan:networking');

const AVAHI_HOST_SERVICE_NAME_PREFIX = 'VxAdmin';

/**
 * An active connection to a VxAdmin host.
 */
export interface HostConnection {
  address: string;
  machineId: string;
  apiClient: grout.Client<PeerApi>;
}

/**
 * Read access to the scanner's connection to a VxAdmin host, maintained by
 * the polling loop started by {@link startScannerNetworking}.
 */
export interface AdminHostClient {
  getHostConnectionInfo(): HostConnectionInfo;
  getHostConnection(): HostConnection | undefined;
}

function createPeerApiClient(address: string): grout.Client<PeerApi> {
  debug('Creating peer API client for %s', address);
  return grout.createClient<PeerApi>({
    baseUrl: `${address}/api`,
    timeout: NETWORK_REQUEST_TIMEOUT_MS,
  });
}

/**
 * Starts scanner networking: discovers VxAdmin hosts on the network and
 * registers with the single reachable host so that cast vote records can be
 * sent to it. Runs a polling loop on `process.nextTick` and returns an
 * {@link AdminHostClient} exposing the current connection state.
 *
 * When {@link ADMIN_HOST_ADDRESS_OVERRIDE} is set, avahi discovery is skipped
 * and the scanner connects to that address directly (useful in development
 * where the avahi daemon may not be running).
 */
export function startScannerNetworking({
  logger,
}: {
  logger: BaseLogger;
}): AdminHostClient {
  const { machineId, codeVersion } = getMachineConfig();
  debug('Starting scanner networking for machine %s', machineId);
  logger.log(LogEventId.AdminNetworkStatus, 'system', {
    message: `Starting VxAdmin host discovery for central scanner ${machineId}.`,
  });

  let connectionInfo: HostConnectionInfo = { status: 'offline' };
  let hostConnection: HostConnection | undefined;
  let consecutiveFailedCycles = 0;

  function setConnectionState(
    newInfo: HostConnectionInfo,
    newConnection?: HostConnection
  ): void {
    if (!deepEqual(connectionInfo, newInfo)) {
      logger.log(LogEventId.AdminNetworkStatus, 'system', {
        message: `Scanner host connection status changed from ${connectionInfo.status} to ${newInfo.status}.`,
        previousStatus: connectionInfo.status,
        newStatus: newInfo.status,
        hostMachineId: newInfo.hostMachineId ?? 'none',
      });
    }
    connectionInfo = newInfo;
    hostConnection = newConnection;
  }

  /**
   * Records a polling cycle where the host couldn't be reached. Discovery and
   * requests to a busy host can transiently fail, so an established
   * connection is kept until enough consecutive cycles fail.
   */
  function recordFailedCycle(): void {
    consecutiveFailedCycles += 1;
    if (
      hostConnection &&
      consecutiveFailedCycles < HOST_DISCONNECT_FAILURE_THRESHOLD
    ) {
      debug(
        'Failed polling cycle %d/%d, keeping connection to host at %s',
        consecutiveFailedCycles,
        HOST_DISCONNECT_FAILURE_THRESHOLD,
        hostConnection.address
      );
      return;
    }
    setConnectionState({ status: 'waiting-for-host' });
  }

  let isPolling = false;

  process.nextTick(() => {
    setInterval(async () => {
      /* istanbul ignore next - re-entrancy guard */
      if (isPolling) return;
      isPolling = true;

      try {
        let candidateAddresses: string[];
        if (ADMIN_HOST_ADDRESS_OVERRIDE) {
          candidateAddresses = [ADMIN_HOST_ADDRESS_OVERRIDE];
        } else {
          if (!(await hasOnlineInterface())) {
            debug('No online interface found, skipping discovery');
            consecutiveFailedCycles = 0;
            setConnectionState({ status: 'offline' });
            return;
          }
          const services = await AvahiService.discoverHttpServices();
          candidateAddresses = services
            .filter((s) => s.name.startsWith(AVAHI_HOST_SERVICE_NAME_PREFIX))
            .filter((s) => isValidIpv4Address(s.resolvedIp))
            .map((s) => `http://${s.resolvedIp}:${s.port}`);
        }

        const existingConnection = hostConnection;
        const reachableHosts: Array<Omit<HostConnection, 'machineId'>> = [];
        for (const address of candidateAddresses) {
          const apiClient =
            existingConnection?.address === address
              ? existingConnection.apiClient
              : createPeerApiClient(address);
          try {
            await apiClient.getCurrentElectionMetadata();
            reachableHosts.push({ address, apiClient });
          } catch {
            debug('Host at %s unreachable, ignoring', address);
          }
        }

        if (reachableHosts.length === 0) {
          recordFailedCycle();
          return;
        }
        if (reachableHosts.length > 1) {
          debug(
            'Multiple reachable VxAdmin hosts found on network (%d), refusing to connect',
            reachableHosts.length
          );
          consecutiveFailedCycles = 0;
          setConnectionState({ status: 'multiple-hosts-detected' });
          return;
        }

        const [reachableHost] = reachableHosts;
        const { address, apiClient } = reachableHost;
        try {
          const hostConfig = await apiClient.registerScanner({
            machineId,
            codeVersion,
          });
          consecutiveFailedCycles = 0;
          setConnectionState(
            {
              status: 'connected-to-host',
              hostMachineId: hostConfig.machineId,
            },
            { address, machineId: hostConfig.machineId, apiClient }
          );
          debug('Connected to host at %s', address);
        } catch (error) {
          debug('Failed to register with host at %s: %s', address, error);
          recordFailedCycle();
        }
      } catch (error) {
        /* istanbul ignore next - defensive */
        debug('Error in scanner networking loop: %s', error);
      } finally {
        isPolling = false;
      }
    }, NETWORK_POLLING_INTERVAL_MS);
  });

  return {
    getHostConnectionInfo: () => connectionInfo,
    getHostConnection: () => hostConnection,
  };
}
