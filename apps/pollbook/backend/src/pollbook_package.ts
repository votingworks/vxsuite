import { Result, assertDefined, err, iter, ok } from '@votingworks/basics';
import { readFile, ReadFileError } from '@votingworks/fs';
import { sha256 } from 'js-sha256';
import { safeParseElectionDefinition, safeParseInt } from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import {
  openZip,
  getEntries,
  getFileByName,
  readTextEntry,
  isElectionManagerAuth,
  isSystemAdministratorAuth,
} from '@votingworks/utils';
import { join } from 'node:path';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { rootDebug } from './debug';
import {
  LocalAppContext,
  PollbookPackage,
  Voter,
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

export enum PollbookPackageFileName {
  ELECTION = 'election.json',
  VOTERS = 'voters.csv',
  STREET_NAMES = 'streetNames.csv',
}

export function parseValidStreetsFromCsvString(
  csvString: string
): ValidStreetInfo[] {
  return parse(csvString, {
    columns: (header) => header.map(toCamelCase),
    skipEmptyLines: true,
    onRecord: (record): ValidStreetInfo | null => {
      // Filter out metadata row at the end
      if (!record.streetName) {
        return null;
      }
      const street: ValidStreetInfo = record;
      return {
        ...street,
        lowRange: safeParseInt(street.lowRange).unsafeUnwrap(),
        highRange: safeParseInt(street.highRange).unsafeUnwrap(),
        side: street.side.toLowerCase() as StreetSide,
      };
    },
  });
}

export function parseVotersFromCsvString(csvString: string): Voter[] {
  let voters: Voter[] = parse(csvString, {
    columns: (header) => header.map(toCamelCase),
    skipEmptyLines: true,
    onRecord: (record): Voter | null => {
      // Filter out metadata row at the end
      if (!record.voterId) {
        return null;
      }
      const postalZip5 = record.postalZip5 ?? record.zip5;
      const mailingCityTown = record.mailingCityTown ?? record.mailingTown;
      const voter: Voter = record;
      return {
        ...voter,
        // Add leading zeros to zip codes if necessary
        postalZip5: postalZip5 && postalZip5.padStart(5, '0'),
        zip4: voter.zip4 && voter.zip4.padStart(4, '0'),
        mailingZip5: voter.mailingZip5 && voter.mailingZip5.padStart(5, '0'),
        mailingZip4: voter.mailingZip4 && voter.mailingZip4.padStart(4, '0'),
        mailingCityTown,
      };
    },
  });
  // Add leading zeros to voter IDs, ensuring they all end up the same length
  const maxVoterIdLength = assertDefined(
    iter(voters)
      .map(({ voterId }) => voterId.length)
      .max()
  );
  voters = voters.map((voter) => ({
    ...voter,
    voterId: voter.voterId.padStart(maxVoterIdLength, '0'),
  }));
  return voters;
}

export async function readPollbookPackage(
  path: string
): Promise<Result<PollbookPackage, ReadFileError>> {
  const pollbookPackage = await readFile(path, {
    maxSize: MAX_POLLBOOK_PACKAGE_SIZE,
  });
  if (pollbookPackage.isErr()) {
    return err(pollbookPackage.err());
  }
  try {
    const fileContents = pollbookPackage.ok() as Uint8Array;
    const zipFile = await openZip(fileContents);
    const zipName = 'pollbook package';
    const entries = getEntries(zipFile);
    const packageHash = sha256(fileContents);

    const electionEntry = getFileByName(
      entries,
      PollbookPackageFileName.ELECTION,
      zipName
    );
    const electionJsonString = await readTextEntry(electionEntry);
    const electionResult = safeParseElectionDefinition(electionJsonString);
    if (electionResult.isErr()) {
      debug('Error parsing election definition: %O', electionResult.err());
      return err({
        type: 'ReadFileError',
        error: new Error(
          `Error parsing election definition: ${electionResult.err()}`
        ),
      });
    }
    const electionDefinition = electionResult.ok();

    const votersEntry = getFileByName(
      entries,
      PollbookPackageFileName.VOTERS,
      zipName
    );
    const votersCsvString = await readTextEntry(votersEntry);
    const voters = parseVotersFromCsvString(votersCsvString);

    const streetsEntry = getFileByName(
      entries,
      PollbookPackageFileName.STREET_NAMES,
      zipName
    );
    const streetCsvString = await readTextEntry(streetsEntry);
    const validStreets = parseValidStreetsFromCsvString(streetCsvString);

    return ok({ electionDefinition, voters, validStreets, packageHash });
  } catch (error) {
    debug('Error reading pollbook package: %O', error);
    return err({
      type: 'ReadFileError',
      error: new Error(`Error reading pollbook package: ${error}`),
    });
  }
}

export function pollUsbDriveForPollbookPackage({
  auth,
  workspace,
  usbDrive,
}: LocalAppContext): void {
  usbDebug('Polling USB drive for pollbook package');
  if (workspace.store.getElection()) {
    return;
  }
  let pollingIntervalLock = false; // Flag to prevent overlapping executions

  process.nextTick(() => {
    const intervalId = setInterval(async () => {
      if (pollingIntervalLock) {
        return; // Skip if a polling iteration is already in progress
      }
      pollingIntervalLock = true; // Set the flag to indicate polling is in progress

      try {
        if (workspace.store.getElection()) {
          clearInterval(intervalId); // Stop the polling interval
          return;
        }

        const usbDriveStatus = await usbDrive.status();
        if (usbDriveStatus.status !== 'mounted') {
          workspace.store.setConfigurationStatus(undefined);
          return;
        }
        usbDebug('Found USB drive mounted at %s', usbDriveStatus.mountPoint);

        const authStatus = await auth.getAuthStatus(
          constructAuthMachineState(workspace)
        );
        if (
          !isElectionManagerAuth(authStatus) &&
          !isSystemAdministratorAuth(authStatus)
        ) {
          usbDebug(
            'Not logged in as election manager or system admin, not configuring'
          );
          return;
        }

        workspace.store.setConfigurationStatus('loading');
        const pollbookPackageResult = await readPollbookPackage(
          join(usbDriveStatus.mountPoint, 'pollbook-package.zip')
        );
        if (pollbookPackageResult.isErr()) {
          const result = pollbookPackageResult.err();
          debug('Read pollbook package error: %O', result);
          if (
            result.type === 'ReadFileError' ||
            (result.type === 'OpenFileError' &&
              'code' in result.error &&
              result.error.code === 'ENOENT')
          ) {
            workspace.store.setConfigurationStatus('not-found');
          } else {
            throw result;
          }
          return;
        }

        const pollbookPackage = pollbookPackageResult.ok();
        workspace.store.setElectionAndVoters(
          pollbookPackage.electionDefinition,
          pollbookPackage.packageHash,
          pollbookPackage.validStreets,
          pollbookPackage.voters
        );
        // Save the zip file asset to be able to propagate to other machines
        await pipeline(
          createReadStream(
            join(usbDriveStatus.mountPoint, 'pollbook-package.zip')
          ),
          createWriteStream(
            join(workspace.assetDirectoryPath, 'pollbook-package.zip')
          )
        );
        workspace.store.setConfigurationStatus(undefined);
        debug('Configured with pollbook package: %O', {
          election: pollbookPackage.electionDefinition.ballotHash,
          voters: pollbookPackage.voters.length,
        });
        clearInterval(intervalId); // Stop the polling interval
      } catch (error) {
        debug('Error during polling loop: %O', error);
      } finally {
        pollingIntervalLock = false; // Reset the flag to allow the next iteration
      }
    }, 100);
  });
}
