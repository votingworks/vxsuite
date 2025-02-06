import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { setInterval } from 'node:timers/promises';
import * as grout from '@votingworks/grout';
import { sleep } from '@votingworks/basics';
import { rootDebug } from './debug';
import { AppContext, PollbookConnectionStatus } from './types';
import { AvahiService } from './avahi';
import {
  NETWORK_POLLING_INTERVAL,
  NETWORK_REQUEST_TIMEOUT,
  PORT,
} from './globals';
import type { Api } from './app';

const debug = rootDebug.extend('networking');

const execPromise = promisify(exec);
// Checks if there is any network interface 'UP'.
export async function hasOnlineInterface(): Promise<boolean> {
  const command = 'ip link show | grep "state UP"';
  try {
    const { stdout, stderr } = await execPromise(command);
    debug(`ip link show stdout: ${stdout}`);
    return stdout.length > 0;
  } catch (error) {
    debug(`Error running ip link show: ${error}`);
    return false;
  }
}

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
      PORT
    );
    await sleep(5000);
    await AvahiService.advertiseHttpService(currentNodeServiceName, PORT);
    debug('Network restarted');
  } catch (error) {
    debug(`Error restarting network: ${error}`);
  }
}

function createApiClientForAddress(address: string): grout.Client<Api> {
  debug('Creating API client for address %s', address);
  return grout.createClient<Api>({
    baseUrl: `${address}/api`,
    timeout: NETWORK_REQUEST_TIMEOUT,
  });
}

export async function setupMachineNetworking({
  machineId,
  workspace,
}: AppContext): Promise<void> {
  const currentNodeServiceName = `Pollbook-${machineId}`;
  // Advertise a service for this machine
  debug('Publishing avahi service %s on port %d', currentNodeServiceName, PORT);
  await AvahiService.advertiseHttpService(currentNodeServiceName, PORT);

  // Poll every 5s for new machines on the network
  process.nextTick(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of setInterval(NETWORK_POLLING_INTERVAL)) {
      if (!(await hasOnlineInterface())) {
        // There is no network to try to connect over. Bail out.
        debug(
          'No online interface found. Setting online status to false and bailing.'
        );
        workspace.store.setOnlineStatus(false);
        continue;
      }

      const currentElection = workspace.store.getElection();
      debug('Polling network for new machines');
      const services = await AvahiService.discoverHttpServices();
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
        continue;
      }
      for (const { name, host, port } of services) {
        if (name !== currentNodeServiceName && !workspace.store.getIsOnline()) {
          // do not bother trying to ping other nodes if we are not online
          continue;
        }
        const currentPollbookService = previouslyConnected[name];
        const apiClient =
          currentPollbookService && currentPollbookService.apiClient
            ? currentPollbookService.apiClient
            : createApiClientForAddress(`http://${host}:${port}`);

        try {
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
              lastSeen: new Date(),
              status: PollbookConnectionStatus.WrongElection,
            });
            continue;
          }
          if (
            !currentPollbookService ||
            currentPollbookService.status !== PollbookConnectionStatus.Connected
          ) {
            debug(
              'Establishing connection with a new pollbook service with machineId %s',
              machineInformation.machineId
            );
          }
          // Sync events from this pollbook service.
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

          // Mark as connected so future events automatically sync.
          workspace.store.setPollbookServiceForName(name, {
            machineId: machineInformation.machineId,
            apiClient,
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
        }
      }
      // Clean up stale machines
      workspace.store.cleanupStalePollbookServices();
    }
  });
}
