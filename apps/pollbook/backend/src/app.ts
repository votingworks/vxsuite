import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { err, ok, Result, sleep } from '@votingworks/basics';
import { UsbDrive } from '@votingworks/usb-drive';
import { readFile, ReadFileError } from '@votingworks/fs';
import { join } from 'node:path';
import {
  getEntries,
  getFileByName,
  openZip,
  readTextEntry,
} from '@votingworks/utils';
import { safeParseJson } from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import { setInterval } from 'node:timers/promises';
import { Workspace } from './workspace';
import {
  ElectionConfiguration,
  ElectionConfigurationSchema,
  PollbookPackage,
  Voter,
  VoterIdentificationMethod,
  VoterSearchParams,
} from './types';
import { rootDebug } from './debug';

const debug = rootDebug;

export interface AppContext {
  workspace: Workspace;
  usbDrive: UsbDrive;
}

// TODO read machine ID from env or network
const machineId = 'placeholder-machine-id';

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
  const election: ElectionConfiguration = safeParseJson(
    electionJsonString,
    ElectionConfigurationSchema
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

function pollUsbDriveForPollbookPackage({ workspace, usbDrive }: AppContext) {
  debug('Polling USB drive for pollbook package');
  if (workspace.store.getElectionConfiguration()) {
    return;
  }
  process.nextTick(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of setInterval(100)) {
      const usbDriveStatus = await usbDrive.status();
      if (usbDriveStatus.status === 'mounted') {
        debug('Found USB drive mounted at %s', usbDriveStatus.mountPoint);
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
    }
  });
}

function buildApi({ workspace }: AppContext) {
  const { store } = workspace;

  return grout.createApi({
    getElectionConfiguration(): Result<
      ElectionConfiguration,
      'unconfigured' | ConfigurationStatus
    > {
      if (configurationStatus) {
        return err(configurationStatus);
      }
      const election = store.getElectionConfiguration();
      return election ? ok(election) : err('unconfigured');
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
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(context: AppContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));
  app.use(express.static(context.workspace.assetDirectoryPath));

  pollUsbDriveForPollbookPackage(context);

  return app;
}
