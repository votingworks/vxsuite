import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as grout from '@votingworks/grout';
import { sleep } from '@votingworks/basics';
import { rootDebug } from './debug';
import { PeerAppContext, PollbookConnectionStatus } from './types';
import { AvahiService, hasOnlineInterface } from './avahi';
import {
  EVENT_POLLING_INTERVAL,
  NETWORK_GOSSIP_BRANCHING_FACTOR,
  NETWORK_POLLING_INTERVAL,
  NETWORK_REQUEST_TIMEOUT,
  PEER_PORT,
} from './globals';
import type { PeerApi } from './peer_app';

const debug = rootDebug.extend('networking');

const execPromise = promisify(exec);

export async function resetNetworkSetup(machineId: string): Promise<void> {
  const command = 'sudo systemctl start join-mesh-network';
  try {
    debug('Removing published service before reset.');
    AvahiService.stopAdvertisedService();
    debug('Triggering network reset.');
    await execPromise(command);
    const currentNodeServiceName = `Pollbook-${machineId}`;
    // Advertise a service for this machine
    debug(
      'Publishing avahi service %s on port %d',
      currentNodeServiceName,
      PEER_PORT
    );
    await sleep(5000);
    await AvahiService.advertiseHttpService(currentNodeServiceName, PEER_PORT);
    debug('Network restarted');
  } catch (error) {
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
        const election = workspace.store.getElection();

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
            if (
              currentPollbookService.status !==
              PollbookConnectionStatus.Connected
            ) {
              return;
            }
            if (
              !election ||
              currentPollbookService.configuredElectionId !== election.id
            ) {
              workspace.store.setPollbookServiceForName(currentName, {
                ...currentPollbookService,
                lastSeen: new Date(),
                status: PollbookConnectionStatus.WrongElection,
              });
              return;
            }
            const { apiClient } = currentPollbookService;
            if (!apiClient) {
              return;
            }
            try {
              debug('Fetching events from ', currentPollbookService.machineId);
              let syncMoreEvents = true;
              while (syncMoreEvents) {
                const lastEventSyncedPerNode =
                  workspace.store.getLastEventSyncedPerNode();
                const { events, hasMore } = await apiClient.getEvents({
                  lastEventSyncedPerNode,
                });
                workspace.store.saveRemoteEvents(events);
                syncMoreEvents = hasMore;
              }

              workspace.store.setPollbookServiceForName(currentName, {
                ...currentPollbookService,
                apiClient,
                lastSeen: new Date(),
                status: PollbookConnectionStatus.Connected,
              });
            } catch (error) {
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

export async function setupMachineNetworking({
  machineId,
  workspace,
}: PeerAppContext): Promise<void> {
  const currentNodeServiceName = `Pollbook-${machineId}`;
  // Advertise a service for this machine
  debug(
    'Publishing avahi service %s on port %d',
    currentNodeServiceName,
    PEER_PORT
  );
  await AvahiService.advertiseHttpService(currentNodeServiceName, PEER_PORT);

  // Poll for new machines on the network
  process.nextTick(() => {
    let isPolling = false;

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

        const currentElection = workspace.store.getElection();
        const services = await AvahiService.discoverHttpServices();
        if (!services.length) {
          debug('No services found on the network');
          return;
        }
        const previouslyConnected = workspace.store.getPollbookServicesByName();
        // If there are any services that were previously connected that no longer show up in avahi
        // Mark them as shut down
        for (const [name, service] of Object.entries(previouslyConnected)) {
          if (!services.some((s) => s.name === name)) {
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
            if (!apiClient) {
              debug('No api client found for %s', name);
              continue;
            }
            const machineInformation = await apiClient.getMachineInformation();
            if (name === currentNodeServiceName) {
              // current machine, if we got here the network is working
              if (workspace.store.getIsOnline() === false) {
                debug('Setting online status to true');
              }
              workspace.store.setOnlineStatus(true);
              continue;
            }
            if (
              !currentElection ||
              currentElection.id !== machineInformation.configuredElectionId
            ) {
              // Only connect if the two machines are configured for the same election.
              workspace.store.setPollbookServiceForName(name, {
                machineId: machineInformation.machineId,
                apiClient,
                address: `http://${resolvedIp}:${port}`,
                lastSeen: new Date(),
                status: PollbookConnectionStatus.WrongElection,
                configuredElectionId: machineInformation.configuredElectionId,
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
              machineId: machineInformation.machineId,
              apiClient,
              address: `http://${resolvedIp}:${port}`,
              lastSeen: new Date(),
              status: PollbookConnectionStatus.Connected,
              configuredElectionId: machineInformation.configuredElectionId,
            });
          } catch (error) {
            if (name === currentNodeServiceName) {
              // Could not ping our own machine, mark as offline
              debug('Failed to establish connection to self: %s', error);
              debug('Setting online status to false');
              workspace.store.setOnlineStatus(false);
            }
            debug(`Failed to establish connection from ${name}: ${error}`);
          }
        }
        // Clean up stale machines
        workspace.store.cleanupStalePollbookServices();
      } catch (error) {
        debug(`Previously uncaught error in network polling: ${error}`);
      } finally {
        isPolling = false;
      }
    }, NETWORK_POLLING_INTERVAL);
  });
}
