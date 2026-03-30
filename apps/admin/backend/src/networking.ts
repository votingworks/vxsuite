import * as grout from '@votingworks/grout';
import {
  AvahiDiscoveredService,
  AvahiService,
  hasOnlineInterface,
  isValidIpv4Address,
} from '@votingworks/networking';
import { assert } from '@votingworks/basics';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import {
  Admin,
  safeParseElectionDefinition,
  type UserRole,
} from '@votingworks/types';
import type { PeerApi } from './peer_app';
import type { Store } from './store';
import type { ClientStore } from './client_store';
import { ClientConnectionStatus } from './types';
import { constructAuthMachineState } from './util/auth';
import { rootDebug } from './util/debug';
import {
  NETWORK_POLLING_INTERVAL_MS,
  NETWORK_REQUEST_TIMEOUT_MS,
} from './globals';

const debug = rootDebug.extend('networking');

const AVAHI_SERVICE_NAME_PREFIX = 'VxAdmin';

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
 * Determines the {@link MachineStatus} for a client based on auth state.
 */
function getClientMachineStatus(
  authStatus: Awaited<ReturnType<DippedSmartCardAuthApi['getAuthStatus']>>
): { status: Admin.ClientMachineStatus; authType: UserRole | null } {
  if (authStatus.status === 'logged_in') {
    return {
      status: Admin.ClientMachineStatus.Active,
      authType: authStatus.user.role,
    };
  }
  return { status: Admin.ClientMachineStatus.OnlineLocked, authType: null };
}

/**
 * Starts host networking: advertises on avahi so clients can discover this host.
 * Polls network status, detects other hosts, and writes status to the store.
 */
export function startHostNetworking({
  machineId,
  peerPort,
  store,
}: {
  machineId: string;
  peerPort: number;
  store: Store;
}): void {
  const serviceName = getHostServiceName(machineId);
  debug('Publishing avahi service %s on port %d', serviceName, peerPort);
  AvahiService.advertiseHttpService(serviceName, peerPort);

  let isPolling = false;

  process.nextTick(() => {
    setInterval(async () => {
      /* istanbul ignore next - re-entrancy guard @preserve */
      if (isPolling) return;
      isPolling = true;

      try {
        const isOnline = await hasOnlineInterface();
        store.setNetworkedMachineStatus(
          machineId,
          'host',
          isOnline
            ? Admin.ClientMachineStatus.Active
            : Admin.ClientMachineStatus.Offline
        );

        if (isOnline) {
          const services = await AvahiService.discoverHttpServices();
          const otherHosts = services.filter(
            (s) =>
              s.name.startsWith(AVAHI_SERVICE_NAME_PREFIX) &&
              s.name !== serviceName
          );
          for (const otherHost of otherHosts) {
            if (!isValidIpv4Address(otherHost.resolvedIp)) continue;
            const otherMachineId = otherHost.name.replace(
              `${AVAHI_SERVICE_NAME_PREFIX}-`,
              ''
            );
            try {
              const address = `http://${otherHost.resolvedIp}:${otherHost.port}`;
              const peerClient = createPeerApiClient(address);
              await peerClient.getCurrentElectionMetadata();
              store.setNetworkedMachineStatus(
                otherMachineId,
                'host',
                Admin.ClientMachineStatus.Active
              );
            } catch {
              debug(
                'Failed to communicate with other host %s, ignoring',
                otherHost.name
              );
            }
          }
        }

        store.cleanupStaleMachines();
      } finally {
        isPolling = false;
      }
    }, NETWORK_POLLING_INTERVAL_MS);
  });
}

/**
 * Starts client networking: discovers VxAdmin hosts on the network and
 * attempts to connect. Runs a polling loop on `process.nextTick`.
 *
 * Writes connection state to the provided {@link ClientStore}.
 */
export function startClientNetworking({
  machineId,
  clientStore,
  auth,
}: {
  machineId: string;
  clientStore: ClientStore;
  auth: DippedSmartCardAuthApi;
}): void {
  debug('Starting client networking for machine %s', machineId);

  let isPolling = false;

  process.nextTick(() => {
    setInterval(async () => {
      /* istanbul ignore next - re-entrancy guard @preserve */
      if (isPolling) return;
      isPolling = true;

      try {
        if (!(await hasOnlineInterface())) {
          debug('No online interface found, skipping discovery');
          clientStore.setConnection(ClientConnectionStatus.Offline);
          return;
        }

        const services = await AvahiService.discoverHttpServices();
        const hostServices = services
          .filter((s) => s.name.startsWith(AVAHI_SERVICE_NAME_PREFIX))
          .filter((s) => isValidIpv4Address(s.resolvedIp));

        if (hostServices.length === 0) {
          debug('No VxAdmin hosts found on network');
          const existing = clientStore.getHostConnection();
          if (existing) {
            debug('Lost connection to host at %s', existing.address);
          }
          clientStore.setConnection(
            ClientConnectionStatus.OnlineWaitingForHost
          );
          return;
        }

        const reachableHosts: AvahiDiscoveredService[] = [];
        for (const service of hostServices) {
          const address = `http://${service.resolvedIp}:${service.port}`;
          try {
            const client = createPeerApiClient(address);
            await client.getCurrentElectionMetadata();
            reachableHosts.push(service);
          } catch {
            debug('Host %s unreachable, ignoring', service.name);
          }
        }
        if (reachableHosts.length > 1) {
          debug(
            'Multiple reachable VxAdmin hosts found on network (%d), refusing to connect',
            reachableHosts.length
          );
          clientStore.setConnection(
            ClientConnectionStatus.OnlineMultipleHostsDetected
          );
          return;
        }

        if (reachableHosts.length === 0) {
          clientStore.setConnection(
            ClientConnectionStatus.OnlineWaitingForHost
          );
          return;
        }

        const [host] = reachableHosts;

        assert(host !== undefined);

        const hostAddress = `http://${host.resolvedIp}:${host.port}`;
        const existing = clientStore.getHostConnection();
        const apiClient =
          existing?.address === hostAddress
            ? existing.apiClient
            : createPeerApiClient(hostAddress);

        try {
          const authStatus = await auth.getAuthStatus(
            constructAuthMachineState(clientStore)
          );
          const { status, authType } = getClientMachineStatus(authStatus);
          const hostConfig = await apiClient.connectToHost({
            machineId,
            status,
            authType,
          });
          clientStore.setConnection(
            ClientConnectionStatus.OnlineConnectedToHost,
            {
              address: hostAddress,
              machineId: hostConfig.machineId,
              apiClient,
            }
          );
          clientStore.setIsClientAdjudicationEnabled(
            hostConfig.isClientAdjudicationEnabled
          );
          debug('Connected to host at %s', hostAddress);

          // Poll the lightweight hash to detect election changes without
          // fetching the full election definition every cycle.
          const remoteHash = await apiClient.getElectionPackageHash();
          const localHash =
            clientStore.getCachedElectionRecord()?.electionPackageHash;

          if (remoteHash !== localHash) {
            if (remoteHash) {
              debug(
                'Election package hash changed, fetching new election data'
              );
              const [electionRecord, systemSettings] = await Promise.all([
                apiClient.getCurrentElectionMetadata(),
                apiClient.getSystemSettings(),
              ]);
              if (electionRecord) {
                const parsed = safeParseElectionDefinition(
                  electionRecord.electionDefinition.electionData
                ).unsafeUnwrap();
                assert(systemSettings !== undefined);
                clientStore.setCachedElectionRecord({
                  ...electionRecord,
                  electionDefinition: parsed,
                });
                clientStore.setCachedSystemSettings(systemSettings);
              }
            } else {
              // Transitioning from configured → unconfigured
              debug('Host election unconfigured, clearing cached data');
              clientStore.setCachedElectionRecord(undefined);
              clientStore.setCachedSystemSettings(undefined);
              auth.logOut(constructAuthMachineState(clientStore));
            }
          }
        } catch (error) {
          debug('Lost connection to host at %s: %s', hostAddress, error);
          clientStore.setConnection(
            ClientConnectionStatus.OnlineWaitingForHost
          );
        }
      } catch (error) {
        /* istanbul ignore next - defensive @preserve */
        debug('Error in client networking loop: %s', error);
      } finally {
        isPolling = false;
      }
    }, NETWORK_POLLING_INTERVAL_MS);
  });
}
