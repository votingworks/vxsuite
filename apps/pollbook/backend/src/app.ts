import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { err, ok, Result } from '@votingworks/basics';
import { DEFAULT_SYSTEM_SETTINGS, PrinterStatus } from '@votingworks/types';
import { setInterval } from 'node:timers/promises';
import { DippedSmartCardAuthMachineState } from '@votingworks/auth';
import { renderToPdf } from '@votingworks/printing';
import React from 'react';
import { getBatteryInfo } from '@votingworks/backend';
import {
  Workspace,
  AppContext,
  DeviceStatuses,
  Election,
  MachineInformation,
  PollbookConnectionStatus,
  PollbookEvent,
  Voter,
  VoterIdentificationMethod,
  VoterSearchParams,
  ConfigurationStatus,
  VoterRegistration,
  ValidStreetInfo,
} from './types';
import { AvahiService } from './avahi';
import { rootDebug } from './debug';
import {
  NETWORK_POLLING_INTERVAL,
  NETWORK_REQUEST_TIMEOUT,
  PORT,
} from './globals';
import { CheckInReceipt } from './check_in_receipt';
import { pollUsbDriveForPollbookPackage } from './pollbook_package';

const debug = rootDebug;

function createApiClientForAddress(address: string): grout.Client<Api> {
  debug('Creating API client for address %s', address);
  return grout.createClient<Api>({
    baseUrl: `${address}/api`,
    timeout: NETWORK_REQUEST_TIMEOUT,
  });
}

function constructAuthMachineState(
  workspace: Workspace
): DippedSmartCardAuthMachineState {
  const election = workspace.store.getElection();
  return {
    ...DEFAULT_SYSTEM_SETTINGS['auth'],
    electionKey: election && {
      id: election.id,
      date: election.date,
    },
  };
}

async function setupMachineNetworking({
  machineId,
  workspace,
}: AppContext): Promise<void> {
  const currentNodeServiceName = `Pollbook-${machineId}`;
  // Advertise a service for this machine
  debug('Publishing service %s on port %d', currentNodeServiceName, PORT);
  await AvahiService.advertiseHttpService(currentNodeServiceName, PORT);

  // Poll every 5s for new machines on the network
  process.nextTick(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of setInterval(NETWORK_POLLING_INTERVAL)) {
      if (!(await AvahiService.hasOnlineInterface())) {
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
          'Current service no longer found on avahi. Setting online status to false'
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
          console.log(error);
        }
      }
      // Clean up stale machines
      workspace.store.cleanupStalePollbookServices();
    }
  });
}

function buildApi(context: AppContext) {
  const { workspace, auth, usbDrive, printer, machineId } = context;
  const { store } = workspace;

  return grout.createApi({
    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(workspace));
    },

    updateSessionExpiry(input: { sessionExpiresAt: Date }) {
      return auth.updateSessionExpiry(
        constructAuthMachineState(workspace),
        input
      );
    },

    async getDeviceStatuses(): Promise<DeviceStatuses> {
      const [usbDriveStatus, printerStatus, batteryStatus] = await Promise.all([
        usbDrive.status(),
        printer.status(),
        getBatteryInfo(),
      ]);
      return {
        usbDrive: usbDriveStatus,
        printer: printerStatus,
        battery: batteryStatus ?? undefined,
        network: {
          isOnline: store.getIsOnline(),
          pollbooks: store.getPollbookServiceInfo().map((pollbook) => ({
            machineId: pollbook.machineId,
            lastSeen: pollbook.lastSeen,
            numCheckIns: pollbook.numCheckIns,
            status: pollbook.status,
          })),
        },
      };
    },

    getPrinterStatus(): Promise<PrinterStatus> {
      return printer.status();
    },

    getElection(): Result<Election, 'unconfigured' | ConfigurationStatus> {
      const configurationStatus = store.getConfigurationStatus();
      if (configurationStatus) {
        return err(configurationStatus);
      }
      const election = store.getElection();
      return election ? ok(election) : err('unconfigured');
    },

    async unconfigure(): Promise<void> {
      store.deleteElectionAndVoters();
      await usbDrive.eject();
      pollUsbDriveForPollbookPackage(context);
    },

    searchVoters(input: {
      searchParams: VoterSearchParams;
    }): Voter[] | number | null {
      const { searchParams } = input;
      if (Object.values(searchParams).every((value) => value === '')) {
        return null;
      }

      return store.searchVoters(searchParams);
    },

    async checkInVoter(input: {
      voterId: string;
      identificationMethod: VoterIdentificationMethod;
    }): Promise<boolean> {
      const { voter, count } = store.recordVoterCheckIn(input);
      debug('Checked in voter %s', voter.voterId);

      const receipt = React.createElement(CheckInReceipt, {
        voter,
        count,
        machineId,
      });
      const receiptPdf = (
        await renderToPdf({
          document: receipt,
          paperDimensions: {
            width: 2.83,
            height: 7,
          },
          marginDimensions: {
            top: 0.1,
            right: 0.1,
            bottom: 0.1,
            left: 0.1,
          },
        })
      ).unsafeUnwrap();
      debug('Printing receipt for voter %s', voter.voterId);
      await printer.print({ data: receiptPdf });

      return true; // Successfully checked in and printed receipt
    },

    undoVoterCheckIn(input: { voterId: string }): void {
      store.recordUndoVoterCheckIn(input.voterId);
    },

    registerVoter(input: {
      registrationData: VoterRegistration;
    }): Voter | undefined {
      const voter = store.registerVoter(input.registrationData);
      return voter;
    },

    getValidStreetInfo(): ValidStreetInfo[] {
      return store.getStreetInfo();
    },

    getCheckInCounts(): { thisMachine: number; allMachines: number } {
      return {
        thisMachine: store.getCheckInCount(machineId),
        allMachines: store.getCheckInCount(),
      };
    },

    getMachineInformation(): MachineInformation {
      const election = store.getElection();
      return {
        machineId,
        configuredElectionId: election ? election.id : undefined,
      };
    },

    receiveEvent(input: { pollbookEvent: PollbookEvent }): boolean {
      return store.saveEvent(input.pollbookEvent);
    },

    getEvents(input: { lastEventSyncedPerNode: Record<string, number> }): {
      events: PollbookEvent[];
      hasMore: boolean;
    } {
      return store.getNewEvents(input.lastEventSyncedPerNode);
    },

    getAllVoters(): Array<{
      voterId: string;
      firstName: string;
      lastName: string;
    }> {
      return store.getAllVoters();
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(context: AppContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));

  pollUsbDriveForPollbookPackage(context);

  void setupMachineNetworking(context);

  return app;
}
