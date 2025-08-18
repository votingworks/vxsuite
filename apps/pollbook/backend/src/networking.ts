import { execFile } from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import { assert, sleep } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { rootDebug } from './debug';
import {
  CommunicatingPollbookConnectionStatuses,
  PeerAppContext,
  PollbookConfigurationInformation,
  PollbookConnectionStatus,
} from './types';
import { AvahiService, hasOnlineInterface } from './avahi';
import {
  EVENT_POLLING_INTERVAL,
  NETWORK_GOSSIP_BRANCHING_FACTOR,
  NETWORK_POLLING_INTERVAL,
  NETWORK_REQUEST_TIMEOUT,
  PEER_PORT,
} from './globals';
import type { PeerApi } from './peer_app';
import { intermediateScript } from './intermediate_scripts';

const debug = rootDebug.extend('networking');

export async function resetNetworkSetup(machineId: string): Promise<void> {
  try {
    debug('Removing published service before reset.');
    AvahiService.stopAdvertisedService();
    debug('Triggering network reset.');
    await execFile('sudo', [intermediateScript('reset-network')]);
    const currentNodeServiceName = `Pollbook-${machineId}`;
    // Advertise a service for this machine
    debug(
      'Publishing avahi service %s on port %d',
      currentNodeServiceName,
      PEER_PORT
    );
    await sleep(5000);
    AvahiService.advertiseHttpService(currentNodeServiceName, PEER_PORT);
    debug('Network restarted');
  } catch (error) {
    /* istanbul ignore next - for safety @preserve */
    debug(`Error restarting network: ${error}`);
  }
}

export function createPeerApiClientForAddress(
  address: string
): grout.Client<PeerApi> {
  debug('Creating API client for address %s', address);
  return grout.createClient<PeerApi>({
    baseUrl: `${address}/api`,
    timeout: NETWORK_REQUEST_TIMEOUT,
  });
}

export function arePollbooksCompatible(
  pollbook1: PollbookConfigurationInformation,
  pollbook2: PollbookConfigurationInformation
): boolean {
  return pollbook1.codeVersion === pollbook2.codeVersion;
}

/* Checks that two pollbooks have compatible configurations to connect and share events */
export function shouldPollbooksShareEvents(
  pollbook1: PollbookConfigurationInformation,
  pollbook2: PollbookConfigurationInformation
): boolean {
  return (
    !!pollbook1.electionBallotHash &&
    pollbook1.electionBallotHash === pollbook2.electionBallotHash &&
    pollbook1.pollbookPackageHash === pollbook2.pollbookPackageHash &&
    !!pollbook1.configuredPrecinctId &&
    pollbook1.configuredPrecinctId === pollbook2.configuredPrecinctId &&
    arePollbooksCompatible(pollbook1, pollbook2)
  );
}

export function fetchEventsFromConnectedPollbooks({
  workspace,
}: PeerAppContext): void {
  // Poll to fetch events from connected pollbooks using a gossip protocol
  process.nextTick(() => {
    let isPolling = false;
    let pollbookQueue: string[] = [];
    setInterval(async () => {
      if (isPolling) {
        return;
      }
      isPolling = true;
      try {
        if (!workspace.store.getIsOnline() || !workspace.store.getElection()) {
          // There is no network to try to connect over. Bail out.
          debug('Not fetching events while offline or unconfigured');
          return;
        }

        const previouslyConnected = workspace.store.getPollbookServicesByName();
        const myMachineInformation =
          workspace.store.getPollbookConfigurationInformation();

        // Maintain a queue of pollbooks to visit, refill and shuffle when empty
        const pollbookNames = Object.keys(previouslyConnected).filter(
          (name) =>
            previouslyConnected[name].status ===
            PollbookConnectionStatus.Connected
        );
        if (pollbookQueue.length === 0) {
          // Shuffle pollbookNames
          pollbookQueue = pollbookNames
            .map((name) => ({ name, sort: Math.random() }))
            .sort((a, b) => a.sort - b.sort)
            .map(({ name }) => name);
        }

        // Select up to NETWORK_GOSSIP_BRANCHING_FACTOR pollbooks from the queue
        const pollbooksToQuery = pollbookQueue.splice(
          0,
          NETWORK_GOSSIP_BRANCHING_FACTOR
        );

        await Promise.all(
          pollbooksToQuery.map(async (currentName) => {
            const currentPollbookService = previouslyConnected[currentName];
            /* istanbul ignore next - extremely unlikely scenario, a machine would need to change code versions to trigger included for defense in depth - @preserve */
            if (
              !arePollbooksCompatible(
                myMachineInformation,
                currentPollbookService
              )
            ) {
              workspace.store.setPollbookServiceForName(currentName, {
                ...currentPollbookService,
                lastSeen: new Date(),
                status: PollbookConnectionStatus.IncompatibleSoftwareVersion,
              });
              return;
            }
            if (
              !shouldPollbooksShareEvents(
                myMachineInformation,
                currentPollbookService
              )
            ) {
              workspace.store.setPollbookServiceForName(currentName, {
                ...currentPollbookService,
                lastSeen: new Date(),
                status: PollbookConnectionStatus.MismatchedConfiguration,
              });
              return;
            }
            const { apiClient } = currentPollbookService;
            /* istanbul ignore next: rare edge case handling @preserve */
            if (!apiClient) {
              return;
            }
            try {
              debug('Fetching events from ', currentPollbookService.machineId);
              let syncMoreEvents = true;
              while (syncMoreEvents) {
                const lastEventSyncedPerNode =
                  workspace.store.getMostRecentEventIdPerMachine();
                const { events, configurationInformation, hasMore } =
                  await apiClient.getEvents({
                    lastEventSyncedPerNode,
                  });
                workspace.store.saveRemoteEvents(
                  events,
                  configurationInformation
                );
                syncMoreEvents = hasMore;
              }

              workspace.store.setPollbookServiceForName(currentName, {
                ...currentPollbookService,
                apiClient,
                lastSeen: new Date(),
                status: PollbookConnectionStatus.Connected,
              });
            } catch (error) {
              assert(error instanceof Error);
              if (error.message === 'mismatched-configuration') {
                workspace.store.setPollbookServiceForName(currentName, {
                  ...currentPollbookService,
                  apiClient,
                  lastSeen: new Date(),
                  status: PollbookConnectionStatus.MismatchedConfiguration,
                });
              }
              debug(
                `Failed to sync events from ${currentPollbookService.machineId}: ${error}`
              );
              debug('The api client is ', apiClient);
            }
          })
        );

        workspace.store.cleanupStalePollbookServices();
      } finally {
        isPolling = false;
      }
    }, EVENT_POLLING_INTERVAL);
  });
}

export function setupMachineNetworking({
  machineId,
  workspace,
}: PeerAppContext): void {
  const currentNodeServiceName = `Pollbook-${machineId}`;
  // Advertise a service for this machine
  debug(
    'Publishing avahi service %s on port %d',
    currentNodeServiceName,
    PEER_PORT
  );
  AvahiService.advertiseHttpService(currentNodeServiceName, PEER_PORT);
  workspace.logger.log(LogEventId.PollbookNetworkStatus, 'system', {
    message: `Published service ${currentNodeServiceName} to avahi on port ${PEER_PORT}`,
  });

  // Poll for new machines on the network
  process.nextTick(() => {
    let isPolling = false;
    const ipAddressesWithRekeyAttempts = new Set<string>();

    setInterval(async () => {
      if (isPolling) {
        return;
      }
      isPolling = true;
      try {
        if (!(await hasOnlineInterface())) {
          // There is no network to try to connect over. Bail out.
          debug(
            'No online interface found. Setting online status to false and bailing.'
          );
          workspace.store.setOnlineStatus(false);
          return;
        }

        const myMachineInformation =
          workspace.store.getPollbookConfigurationInformation();
        const services = await AvahiService.discoverHttpServices();
        const previouslyConnected = workspace.store.getPollbookServicesByName();
        // If there are any services that were previously connected that no longer show up in avahi
        // Mark them as shut down
        for (const [name, service] of Object.entries(previouslyConnected)) {
          // Only transition to shutdown for a service we are communicating with.
          if (
            !services.some((s) => s.name === name) &&
            CommunicatingPollbookConnectionStatuses.includes(service.status)
          ) {
            debug(
              'Marking %s as shut down as it is no longer published on Avahi',
              name
            );
            workspace.store.setPollbookServiceForName(name, {
              ...service,
              apiClient: undefined,
              status: PollbookConnectionStatus.ShutDown,
            });
          }
        }
        if (!services.some((s) => s.name === currentNodeServiceName)) {
          // If the current machine is no longer published on Avahi, mark as offline
          debug(
            'The current service is no longer found on avahi. Setting online status to false'
          );
          workspace.store.setOnlineStatus(false);
          return;
        }
        for (const { name, resolvedIp, port } of services) {
          debug('Checking service %s at %s:%d', name, resolvedIp, port);
          if (
            name !== currentNodeServiceName &&
            !workspace.store.getIsOnline()
          ) {
            // do not bother trying to ping other nodes if we are not online
            continue;
          }
          const currentPollbookService = previouslyConnected[name];
          if (currentPollbookService && currentPollbookService.apiClient) {
            debug('Using previous API client for %s', name);
          }
          const apiClient =
            currentPollbookService && currentPollbookService.apiClient
              ? currentPollbookService.apiClient
              : createPeerApiClientForAddress(`http://${resolvedIp}:${port}`);

          try {
            const machineInformation =
              await apiClient.getPollbookConfigurationInformation();
            if (ipAddressesWithRekeyAttempts.has(resolvedIp)) {
              ipAddressesWithRekeyAttempts.delete(resolvedIp);
            }
            if (name === currentNodeServiceName) {
              // current machine, if we got here the network is working
              if (workspace.store.getIsOnline() === false) {
                debug('Setting online status to true');
              }
              workspace.store.setOnlineStatus(true);
              continue;
            }
            if (
              !arePollbooksCompatible(myMachineInformation, machineInformation)
            ) {
              workspace.store.setPollbookServiceForName(name, {
                ...machineInformation,
                apiClient,
                address: `http://${resolvedIp}:${port}`,
                lastSeen: new Date(),
                status: PollbookConnectionStatus.IncompatibleSoftwareVersion,
              });
              continue;
            }
            if (
              !shouldPollbooksShareEvents(
                myMachineInformation,
                machineInformation
              )
            ) {
              workspace.store.setPollbookServiceForName(name, {
                ...machineInformation,
                apiClient,
                address: `http://${resolvedIp}:${port}`,
                lastSeen: new Date(),
                status: PollbookConnectionStatus.MismatchedConfiguration,
              });
              continue;
            }
            if (
              !currentPollbookService ||
              currentPollbookService.status !==
                PollbookConnectionStatus.Connected
            ) {
              debug(
                'Establishing connection with a new pollbook service with machineId %s',
                machineInformation.machineId
              );
            }
            // Mark as connected so events start syncing.
            workspace.store.setPollbookServiceForName(name, {
              ...machineInformation,
              apiClient,
              address: `http://${resolvedIp}:${port}`,
              lastSeen: new Date(),
              status: PollbookConnectionStatus.Connected,
            });
          } catch (error) {
            if (name === currentNodeServiceName) {
              // Could not ping our own machine, mark as offline
              debug('Failed to establish connection to self: %s', error);
              debug('Setting online status to false');
              workspace.store.setOnlineStatus(false);
            }
            debug(`Failed to establish connection from ${name}: ${error}`);
            // Try rekeying the connection.
            if (!ipAddressesWithRekeyAttempts.has(resolvedIp)) {
              ipAddressesWithRekeyAttempts.add(resolvedIp);
              debug('Rekeying connection for %s at %s', name, resolvedIp);
              await execFile('sudo', [
                intermediateScript('rekey-connection'),
                resolvedIp,
              ]);
            }
          }
        }
        // Clean up stale machines
        workspace.store.cleanupStalePollbookServices();
      } catch (error) {
        /* istanbul ignore next - for safety @preserve */
        debug(`Previously uncaught error in network polling: ${error}`);
      } finally {
        isPolling = false;
      }
    }, NETWORK_POLLING_INTERVAL);
  });
}
