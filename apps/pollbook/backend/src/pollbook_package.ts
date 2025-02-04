import { Result, err, ok } from '@votingworks/basics';
import { readFile, ReadFileError } from '@votingworks/fs';
import { safeParse, safeParseInt, safeParseJson } from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import { setInterval } from 'node:timers/promises';
import {
  openZip,
  getEntries,
  getFileByName,
  readTextEntry,
  isElectionManagerAuth,
} from '@votingworks/utils';
import { join } from 'node:path';
import { rootDebug } from './debug';
import {
  AppContext,
  PollbookPackage,
  Voter,
  Election,
  ElectionSchema,
  ValidStreetInfo,
  StreetSide,
} from './types';
import { MAX_POLLBOOK_PACKAGE_SIZE } from './globals';
import { constructAuthMachineState } from './auth';

const usbDebug = rootDebug.extend('usb');
const debug = rootDebug.extend('pollbook-package');

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
  const zipFile = await openZip(pollbookPackage.ok() as Uint8Array);
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

  const streetsEntry = getFileByName(entries, 'streetNames.csv', zipName);
  const streetCsvString = await readTextEntry(streetsEntry);
  const validStreets = parse(streetCsvString, {
    columns: (header) => header.map(toCamelCase),
    skipEmptyLines: true,
    // Filter out metadata row at the end
    onRecord: (street) => {
      const record = street.streetName ? street : null;
      if (record) {
        record.lowRange = safeParseInt(record.lowRange).unsafeUnwrap();
        record.highRange = safeParseInt(record.highRange).unsafeUnwrap();
        record.side = record.side.toLowerCase() as StreetSide;
      }
      return record;
    },
  }) as ValidStreetInfo[];

  return ok({ election, voters, validStreets });
}

export function pollUsbDriveForPollbookPackage({
  auth,
  workspace,
  usbDrive,
}: AppContext): void {
  usbDebug('Polling USB drive for pollbook package');
  if (workspace.store.getElection()) {
    return;
  }
  process.nextTick(async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of setInterval(100)) {
      const usbDriveStatus = await usbDrive.status();
      if (usbDriveStatus.status !== 'mounted') {
        workspace.store.setConfigurationStatus(undefined);
        continue;
      }
      usbDebug('Found USB drive mounted at %s', usbDriveStatus.mountPoint);

      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(workspace)
      );
      if (!isElectionManagerAuth(authStatus)) {
        usbDebug('Not logged in as election manager, not configuring');
        continue;
      }

      workspace.store.setConfigurationStatus('loading');
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
          workspace.store.setConfigurationStatus('not-found');
        } else {
          throw result;
        }
        workspace.store.setConfigurationStatus('not-found');
        continue;
      }
      const pollbookPackage = pollbookPackageResult.ok();
      workspace.store.setElectionAndVoters(
        pollbookPackage.election,
        pollbookPackage.validStreets,
        pollbookPackage.voters
      );
      workspace.store.setConfigurationStatus(undefined);
      debug('Configured with pollbook package: %O', {
        election: pollbookPackage.election,
        voters: pollbookPackage.voters.length,
      });
      break;
    }
  });
}
