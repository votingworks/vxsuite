import * as grout from '@votingworks/grout';
import {
  AvahiService,
  hasOnlineInterface,
  isValidIpv4Address,
} from '@votingworks/networking';
import { assert } from '@votingworks/basics';
import type { PeerApi } from './peer_app';
import { rootDebug } from './util/debug';

const debug = rootDebug.extend('networking');

const AVAHI_SERVICE_NAME_PREFIX = 'VxAdmin';
const NETWORK_POLLING_INTERVAL_MS = 2000;
const NETWORK_REQUEST_TIMEOUT_MS = 1000;

/**
 * Connection status for a client machine.
 */
export type NetworkConnectionStatus =
  | { status: 'offline' }
  | { status: 'online-waiting-for-host' }
  | { status: 'online-connected-to-host'; hostMachineId: string };

/**
 * Network status for the host machine.
 */
export type HostNetworkStatus = 'online' | 'offline';

/**
 * Returns the avahi service name for a VxAdmin host.
 */
export function getHostServiceName(machineId: string): string {
  return `${AVAHI_SERVICE_NAME_PREFIX}-${machineId}`;
}

/**
 * Creates a Grout client for a host's peer API at the given address.
 */
function createPeerApiClient(address: string): grout.Client<PeerApi> {
  debug('Creating peer API client for %s', address);
  return grout.createClient<PeerApi>({
    baseUrl: `${address}/api`,
    timeout: NETWORK_REQUEST_TIMEOUT_MS,
  });
}

/**
 * Starts host networking: advertises on avahi so clients can discover this host.
 * Polls network status and returns a function to get the current status.
 */
export function startHostNetworking({
  machineId,
  peerPort,
}: {
  machineId: string;
  peerPort: number;
}): () => HostNetworkStatus {
  const serviceName = getHostServiceName(machineId);
  debug('Publishing avahi service %s on port %d', serviceName, peerPort);
  AvahiService.advertiseHttpService(serviceName, peerPort);
  // TODO(CARO) - poll the network for other hosts and surface an error when there is more than one host.

  let isOnline = false;

  process.nextTick(() => {
    setInterval(async () => {
      isOnline = await hasOnlineInterface();
    }, NETWORK_POLLING_INTERVAL_MS);
  });

  return function getHostNetworkStatus(): HostNetworkStatus {
    return isOnline ? 'online' : 'offline';
  };
}

/**
 * Starts client networking: discovers VxAdmin hosts on the network and
 * attempts to connect. Runs a polling loop on `process.nextTick`.
 *
 * Returns a function to get the current connection status.
 */
export function startClientNetworking({
  machineId,
}: {
  machineId: string;
}): () => NetworkConnectionStatus {
  debug('Starting client networking for machine %s', machineId);

  let isPolling = false;
  let connectedHostAddress: string | undefined;
  let connectedHostMachineId: string | undefined;
  let peerApiClient: grout.Client<PeerApi> | undefined;
  let isOnline = false;

  process.nextTick(() => {
    setInterval(async () => {
      /* istanbul ignore next - re-entrancy guard @preserve */
      if (isPolling) return;
      isPolling = true;

      try {
        if (!(await hasOnlineInterface())) {
          debug('No online interface found, skipping discovery');
          isOnline = false;
          return;
        }

        isOnline = true;

        const services = await AvahiService.discoverHttpServices();
        const hostServices = services.filter((s) =>
          s.name.startsWith(AVAHI_SERVICE_NAME_PREFIX)
        );

        if (hostServices.length === 0) {
          debug('No VxAdmin hosts found on network');
          if (connectedHostAddress) {
            debug('Lost connection to host at %s', connectedHostAddress);
            connectedHostAddress = undefined;
            connectedHostMachineId = undefined;
            peerApiClient = undefined;
          }
          return;
        }

        // TODO(CARO) - handle multiple hosts found case (currently just uses the first discovered host)
        const [host] = hostServices;
        assert(host !== undefined);
        if (!isValidIpv4Address(host.resolvedIp)) {
          debug(
            'Invalid IP address for host %s: %s',
            host.name,
            host.resolvedIp
          );
          return;
        }

        const hostAddress = `http://${host.resolvedIp}:${host.port}`;

        // Reuse existing client if same host
        if (connectedHostAddress === hostAddress && peerApiClient) {
          try {
            await peerApiClient.getHostMachineConfig();
            debug('Heartbeat to host at %s succeeded', hostAddress);
          } catch {
            debug('Heartbeat to host at %s failed', hostAddress);
            connectedHostAddress = undefined;
            connectedHostMachineId = undefined;
            peerApiClient = undefined;
          }
          return;
        }

        // New host discovered — attempt connection
        debug('Attempting to connect to host %s at %s', host.name, hostAddress);
        const client = createPeerApiClient(hostAddress);
        try {
          const result = await client.connectToHost({ machineId });
          /* istanbul ignore else - only 'ok' status currently returned @preserve */
          if (result.status === 'ok') {
            connectedHostAddress = hostAddress;
            peerApiClient = client;
            const hostConfig = await client.getHostMachineConfig();
            connectedHostMachineId = hostConfig.machineId;
            debug('Connected to host %s at %s', host.name, hostAddress);
          }
        } catch (error) {
          debug('Failed to connect to host %s: %s', host.name, error);
        }
      } catch (error) {
        /* istanbul ignore next - defensive @preserve */
        debug('Error in client networking loop: %s', error);
      } finally {
        isPolling = false;
      }
    }, NETWORK_POLLING_INTERVAL_MS);
  });

  return function getConnectionStatus(): NetworkConnectionStatus {
    if (!isOnline) {
      return { status: 'offline' };
    }
    if (connectedHostAddress && connectedHostMachineId) {
      return {
        status: 'online-connected-to-host',
        hostMachineId: connectedHostMachineId,
      };
    }
    return { status: 'online-waiting-for-host' };
  };
}
