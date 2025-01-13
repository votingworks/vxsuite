import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { err, ok, Result, sleep } from '@votingworks/basics';
import { UsbDrive } from '@votingworks/usb-drive';
import { readFile, ReadFileError } from '@votingworks/fs';
import { join } from 'node:path';
import {
  getEntries,
  getFileByName,
  isElectionManagerAuth,
  openZip,
  readTextEntry,
} from '@votingworks/utils';
import { DEFAULT_SYSTEM_SETTINGS, safeParseJson } from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import { setInterval } from 'node:timers/promises';
import {
  DippedSmartCardAuthApi,
  DippedSmartCardAuthMachineState,
} from '@votingworks/auth';
import { Workspace } from './workspace';
import {
  Election,
  ElectionSchema,
  PollbookPackage,
  Voter,
  VoterIdentificationMethod,
  VoterSearchParams,
} from './types';
import { AvahiService } from './avahi';
import { rootDebug } from './debug';
import {
  NETWORK_POLLING_INTERVAL,
  NETWORK_REQUEST_TIMEOUT,
  PORT,
} from './globals';

const debug = rootDebug;

export interface AppContext {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  usbDrive: UsbDrive;
  machineId: string;
}

const MEGABYTE = 1024 * 1024;
const MAX_POLLBOOK_PACKAGE_SIZE = 10 * MEGABYTE;

function toCamelCase(str: string) {
  const words = str
    .split(/[^a-zA-Z0-9]/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
  const first = words.shift();
  const rest = words.map((word) => word[0].toUpperCase() + word.slice(1));
  return [first, ...rest].join('');
}

function createApiClientForAddress(address: string): grout.Client<Api> {
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

async function readPollbookPackage(
  path: string
): Promise<Result<PollbookPackage, ReadFileError>> {
  const pollbookPackage = await readFile(path, {
    maxSize: MAX_POLLBOOK_PACKAGE_SIZE,
  });
  if (pollbookPackage.isErr()) {
    return err(pollbookPackage.err());
  }
  const zipFile = await openZip(pollbookPackage.ok());
  const zipName = 'pollbook package';
  const entries = getEntries(zipFile);

  const electionEntry = getFileByName(entries, 'election.json', zipName);
  const electionJsonString = await readTextEntry(electionEntry);
  const election: Election = safeParseJson(
    electionJsonString,
    ElectionSchema
  ).unsafeUnwrap();

  const votersEntry = getFileByName(entries, 'voters.csv', zipName);
  const votersCsvString = await readTextEntry(votersEntry);
  const voters = parse(votersCsvString, {
    columns: (header) => header.map(toCamelCase),
    skipEmptyLines: true,
    // Filter out metadata row at the end
    onRecord: (record) => (record.voterId ? record : null),
  }) as Voter[];

  return ok({ election, voters });
}

type ConfigurationStatus = 'loading' | 'not-found';
let configurationStatus: ConfigurationStatus | undefined;

function pollUsbDriveForPollbookPackage({
  auth,
  workspace,
  usbDrive,
}: AppContext) {
  debug('Polling USB drive for pollbook package');
  if (workspace.store.getElection()) {
    return;
  }
  process.nextTick(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of setInterval(100)) {
      const usbDriveStatus = await usbDrive.status();
      if (usbDriveStatus.status !== 'mounted') {
        continue;
      }
      debug('Found USB drive mounted at %s', usbDriveStatus.mountPoint);

      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );
      if (!isElectionManagerAuth(authStatus)) {
        debug('Not logged in as election manager, not configuring');
        continue;
      }

      configurationStatus = 'loading';
      const pollbookPackageResult = await readPollbookPackage(
        join(usbDriveStatus.mountPoint, 'pollbook-package.zip')
      );
      if (pollbookPackageResult.isErr()) {
        const result = pollbookPackageResult.err();
        debug('Read pollbook package error: %O', result);
        if (
          result.type === 'OpenFileError' &&
          'code' in result.error &&
          result.error.code === 'ENOENT'
        ) {
          configurationStatus = 'not-found';
        } else {
          throw result;
        }
        configurationStatus = 'not-found';
        continue;
      }
      const pollbookPackage = pollbookPackageResult.ok();
      workspace.store.setElectionAndVoters(
        pollbookPackage.election,
        pollbookPackage.voters
      );
      configurationStatus = undefined;
      debug('Configured with pollbook package: %O', {
        election: pollbookPackage.election,
        voters: pollbookPackage.voters.length,
      });
      break;
    }
  });
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
      debug('Polling network for new machines');
      const services = await AvahiService.discoverHttpServices();
      for (const { name, host, port } of services) {
        if (name === currentNodeServiceName) {
          // current machine, do not need to connect
          continue;
        }
        const currentPollbookService =
          workspace.store.getPollbookServiceForName(name);
        const apiClient = currentPollbookService
          ? currentPollbookService.apiClient
          : createApiClientForAddress(`http://${host}:${port}`);

        try {
          const retrievedMachineId = await apiClient.getMachineId();
          if (currentPollbookService) {
            currentPollbookService.lastSeen = new Date();
            workspace.store.setPollbookServiceForName(
              name,
              currentPollbookService
            );
          } else {
            debug(
              'Discovered new pollbook with machineId %s on the network',
              retrievedMachineId
            );
            workspace.store.setPollbookServiceForName(name, {
              machineId: retrievedMachineId,
              apiClient,
              lastSeen: new Date(),
            });
          }
        } catch (error) {
          debug(`Failed to get machineId from ${name}: ${error}`);
        }
      }
      // Clean up stale machines
      workspace.store.cleanupStalePollbookServices();
    }
  });
}

function buildApi(context: AppContext) {
  const { auth, workspace, usbDrive, machineId } = context;
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

    getElection(): Result<Election, 'unconfigured' | ConfigurationStatus> {
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
      store.recordVoterCheckIn(
        input.voterId,
        input.identificationMethod,
        machineId
      );

      // TODO print voter receipt
      await sleep(2000);

      return true; // Successfully checked in and printed receipt
    },

    getCheckInCounts(): { thisMachine: number; allMachines: number } {
      return {
        thisMachine: store.getCheckInCount(machineId),
        allMachines: store.getCheckInCount(),
      };
    },

    getMachineId(): string {
      return machineId;
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
