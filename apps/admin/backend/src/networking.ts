import * as grout from '@votingworks/grout';
import {
  AvahiService,
  hasOnlineInterface,
  isValidIpv4Address,
} from '@votingworks/networking';
import { assert, deepEqual } from '@votingworks/basics';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import {
  Admin,
  formatElectionHashes,
  safeParseElectionDefinition,
  type UserRole,
} from '@votingworks/types';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import type { PeerApi } from './peer_app';
import type { Store } from './store';
import type { ClientStore, HostConnection } from './client_store';
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
  logger,
}: {
  machineId: string;
  peerPort: number;
  store: Store;
  logger: BaseLogger;
}): void {
  const serviceName = getHostServiceName(machineId);
  debug('Publishing avahi service %s on port %d', serviceName, peerPort);
  AvahiService.advertiseHttpService(serviceName, peerPort);
  logger.log(LogEventId.AdminNetworkStatus, 'system', {
    message: `Published avahi service ${serviceName} on port ${peerPort}.`,
  });

  type HostNetworkStatus = 'offline' | 'online' | 'multipleHosts';

  let previousStatus: HostNetworkStatus | undefined;

  function logStatusTransition(
    newStatus: HostNetworkStatus,
    extra: Record<string, string> = {}
  ): void {
    if (newStatus === previousStatus) return;
    const messages: Record<HostNetworkStatus, string> = {
      offline: 'Host network interface is offline.',
      online: 'Host network interface is online.',
      multipleHosts: 'Multiple VxAdmin hosts detected on network.',
    };
    logger.log(LogEventId.AdminNetworkStatus, 'system', {
      message: messages[newStatus],
      disposition: newStatus === 'offline' ? 'failure' : 'success',
      previousStatus: previousStatus ?? 'unknown',
      newStatus,
      ...extra,
    });
    previousStatus = newStatus;
  }

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

        if (!isOnline) {
          logStatusTransition('offline');
          store.cleanupStaleMachines();
          return;
        }

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

        if (otherHosts.length > 1) {
          logStatusTransition('multipleHosts', {
            hostCount: String(otherHosts.length),
          });
        } else {
          logStatusTransition('online');
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
  logger,
}: {
  machineId: string;
  clientStore: ClientStore;
  auth: DippedSmartCardAuthApi;
  logger: BaseLogger;
}): void {
  debug('Starting client networking for machine %s', machineId);
  logger.log(LogEventId.AdminNetworkStatus, 'system', {
    message: `Starting client networking for machine ${machineId}.`,
  });

  clientStore.setOnDisconnect(() => {
    auth.logOut(constructAuthMachineState(clientStore));
  });

  let isPolling = false;

  interface ClientNetworkState {
    connectionStatus: ClientConnectionStatus;
    isClientAdjudicationEnabled?: boolean;
  }
  let previousState: ClientNetworkState | undefined;

  function logStatusTransition(
    input: ClientNetworkState,
    extra: Record<string, string> = {}
  ): void {
    const newState: Required<ClientNetworkState> = {
      connectionStatus: input.connectionStatus,
      isClientAdjudicationEnabled: input.isClientAdjudicationEnabled ?? false,
    };

    if (deepEqual(previousState, newState)) return;

    if (previousState?.connectionStatus !== newState.connectionStatus) {
      logger.log(LogEventId.AdminNetworkStatus, 'system', {
        message: `Client connection status changed from ${
          previousState?.connectionStatus ?? 'unknown'
        } to ${newState.connectionStatus}.`,
        previousStatus: previousState?.connectionStatus ?? 'unknown',
        newStatus: newState.connectionStatus,
        ...extra,
      });
    }

    if (
      (previousState?.isClientAdjudicationEnabled ?? false) !==
      newState.isClientAdjudicationEnabled
    ) {
      logger.log(LogEventId.AdminNetworkStatus, 'system', {
        message: `Client adjudication ${
          newState.isClientAdjudicationEnabled ? 'enabled' : 'disabled'
        } by host.`,
        disposition: 'success',
      });
    }

    previousState = newState;
  }

  process.nextTick(() => {
    setInterval(async () => {
      /* istanbul ignore next - re-entrancy guard @preserve */
      if (isPolling) return;
      isPolling = true;

      try {
        if (!(await hasOnlineInterface())) {
          debug('No online interface found, skipping discovery');
          logStatusTransition({
            connectionStatus: ClientConnectionStatus.Offline,
          });
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
          logStatusTransition({
            connectionStatus: ClientConnectionStatus.OnlineWaitingForHost,
          });
          clientStore.setConnection(
            ClientConnectionStatus.OnlineWaitingForHost
          );
          return;
        }

        const existingConnection = clientStore.getHostConnection();
        const reachableHosts: Array<Omit<HostConnection, 'machineId'>> = [];
        for (const service of hostServices) {
          const address = `http://${service.resolvedIp}:${service.port}`;
          const apiClient =
            existingConnection?.address === address
              ? existingConnection.apiClient
              : createPeerApiClient(address);
          try {
            await apiClient.getCurrentElectionMetadata();
            reachableHosts.push({ address, apiClient });
          } catch {
            debug('Host %s unreachable, ignoring', service.name);
          }
        }
        if (reachableHosts.length > 1) {
          debug(
            'Multiple reachable VxAdmin hosts found on network (%d), refusing to connect',
            reachableHosts.length
          );
          logStatusTransition(
            {
              connectionStatus:
                ClientConnectionStatus.OnlineMultipleHostsDetected,
            },
            { hostCount: String(hostServices.length) }
          );
          clientStore.setConnection(
            ClientConnectionStatus.OnlineMultipleHostsDetected
          );
          return;
        }

        if (reachableHosts.length === 0) {
          logStatusTransition({
            connectionStatus: ClientConnectionStatus.OnlineWaitingForHost,
          });
          clientStore.setConnection(
            ClientConnectionStatus.OnlineWaitingForHost
          );
          return;
        }

        const reachableHost = reachableHosts[0];
        assert(reachableHost !== undefined);
        const { address: hostAddress, apiClient } = reachableHost;

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
          logStatusTransition(
            {
              connectionStatus: ClientConnectionStatus.OnlineConnectedToHost,
              isClientAdjudicationEnabled:
                hostConfig.isClientAdjudicationEnabled,
            },
            { hostMachineId: hostConfig.machineId }
          );
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
                logger.log(LogEventId.AdminNetworkStatus, 'system', {
                  message: `Election package hash changed, syncing new election data from host. Election ID: ${formatElectionHashes(
                    parsed.ballotHash,
                    remoteHash
                  )}.`,
                });
                clientStore.setCachedElectionRecord({
                  ...electionRecord,
                  electionDefinition: parsed,
                });
                clientStore.setCachedSystemSettings(systemSettings);
              }
            } else {
              debug('Host election unconfigured, clearing cached data');
              logger.log(LogEventId.AdminNetworkStatus, 'system', {
                message:
                  'Host election unconfigured, clearing cached election data.',
              });
              clientStore.setCachedElectionRecord(undefined);
              clientStore.setCachedSystemSettings(undefined);
              auth.logOut(constructAuthMachineState(clientStore));
            }
          }
        } catch (error) {
          debug('Lost connection to host at %s: %s', hostAddress, error);
          logStatusTransition({
            connectionStatus: ClientConnectionStatus.OnlineWaitingForHost,
          });
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
