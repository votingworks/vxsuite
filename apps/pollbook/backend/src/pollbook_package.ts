import { Result, assertDefined, err, iter, ok } from '@votingworks/basics';
import { readFile, ReadFileError } from '@votingworks/fs';
import { sha256 } from 'js-sha256';
import {
  Election,
  safeParseElectionDefinition,
  safeParseInt,
  StreetSide,
  ValidStreetInfo,
  Voter,
} from '@votingworks/types';
import { parse } from 'csv-parse/sync';
import {
  openZip,
  getEntries,
  getFilePrefixedByName,
  readTextEntry,
  isSystemAdministratorAuth,
  isElectionManagerAuth,
} from '@votingworks/utils';
import { join } from 'node:path';
import { readdir, lstat } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { rootDebug } from './debug';
import {
  LocalAppContext,
  PollbookPackage,
  PeerAppContext,
  PollbookConnectionStatus,
} from './types';
import {
  CONFIGURATION_POLLING_INTERVAL,
  MAX_POLLBOOK_PACKAGE_SIZE,
  POLLBOOK_PACKAGE_ASSET_FILE_NAME,
  POLLBOOK_PACKAGE_FILENAME_PREFIX,
} from './globals';
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
  ELECTION = 'election',
  VOTERS = 'voters',
  STREET_NAMES = 'streetNames',
}

type PollbookPackageParseError =
  | {
      type: 'UnexpectedPrecinct';
      error: globalThis.Error;
    }
  | ReadFileError;

export function getExternalPrecinctIdMappingFromElection(
  election: Election
): Record<string, string> {
  const externalIdToPrecinctId: Record<string, string> = {};
  for (const precinct of election.precincts) {
    const nameParts = precinct.name.split(/[\s-]+/);
    const externalId = nameParts[nameParts.length - 1];
    if (!externalId) {
      throw new Error(
        `Invalid precinct external identifier for precinct "${precinct.name}"`
      );
    }
    externalIdToPrecinctId[externalId] = precinct.id;
  }
  return externalIdToPrecinctId;
}

export function parseValidStreetsFromCsvString(
  csvString: string,
  election: Election
): ValidStreetInfo[] {
  const externalIdToPrecinctId =
    getExternalPrecinctIdMappingFromElection(election);
  return parse(csvString, {
    columns: (header) => header.map(toCamelCase),
    skipEmptyLines: true,
    onRecord: (record): ValidStreetInfo | null => {
      // Filter out metadata row at the end
      if (!record.streetName) {
        return null;
      }
      const street: ValidStreetInfo = record;
      const postalCityTown = record.postalCityTown ?? record.postalCity;

      const externalWardId = record.ward ?? record.district;
      if (externalWardId && !externalIdToPrecinctId[externalWardId]) {
        throw new Error(`Unexpected ward or district: ${externalWardId}`);
      }
      const precinct = externalIdToPrecinctId[externalWardId] || '';

      return {
        ...street,
        lowRange: safeParseInt(street.lowRange).unsafeUnwrap(),
        highRange: safeParseInt(street.highRange).unsafeUnwrap(),
        side: street.side.toLowerCase() as StreetSide,
        postalCityTown,
        precinct,
      };
    },
  });
}

export function parseVotersFromCsvString(
  csvString: string,
  election: Election
): Voter[] {
  const externalIdToPrecinctId =
    getExternalPrecinctIdMappingFromElection(election);
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
      const postalCityTown = record.postalCityTown ?? record.postalCity;
      const voter: Voter = record;

      const externalWardId = record.ward ?? record.district;
      if (externalWardId && !externalIdToPrecinctId[externalWardId]) {
        throw new Error(`Unexpected ward or district: ${externalWardId}`);
      }
      const precinct = externalIdToPrecinctId[externalWardId] || '';

      return {
        ...voter,
        precinct,
        // Add leading zeros to zip codes if necessary
        postalZip5: postalZip5 && postalZip5.padStart(5, '0'),
        zip4: voter.zip4 && voter.zip4.padStart(4, '0'),
        mailingZip5: voter.mailingZip5 && voter.mailingZip5.padStart(5, '0'),
        mailingZip4: voter.mailingZip4 && voter.mailingZip4.padStart(4, '0'),
        mailingCityTown,
        postalCityTown,
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
): Promise<Result<PollbookPackage, PollbookPackageParseError>> {
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

    const electionEntry = getFilePrefixedByName(
      entries,
      PollbookPackageFileName.ELECTION,
      'json',
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

    const votersEntry = getFilePrefixedByName(
      entries,
      PollbookPackageFileName.VOTERS,
      'csv',
      zipName
    );
    const votersCsvString = await readTextEntry(votersEntry);
    const voters = parseVotersFromCsvString(
      votersCsvString,
      electionDefinition.election
    );

    const streetsEntry = getFilePrefixedByName(
      entries,
      PollbookPackageFileName.STREET_NAMES,
      'csv',
      zipName
    );
    const streetCsvString = await readTextEntry(streetsEntry);
    const validStreets = parseValidStreetsFromCsvString(
      streetCsvString,
      electionDefinition.election
    );

    return ok({ electionDefinition, voters, validStreets, packageHash });
  } catch (error) {
    debug('Error reading pollbook package: %O', error);
    const typedError = error as globalThis.Error;
    if (typedError.message.startsWith('Unexpected ward or district')) {
      return err({
        type: 'UnexpectedPrecinct',
        error: typedError,
      });
    }

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
  let hadConfigurationError = false;

  process.nextTick(() => {
    const intervalId = setInterval(async () => {
      if (pollingIntervalLock) {
        return; // Skip if a polling iteration is already in progress
      }
      pollingIntervalLock = true; // Set the flag to indicate polling is in progress

      try {
        if (workspace.store.getElection()) {
          workspace.store.setConfigurationStatus(undefined);
          clearInterval(intervalId); // Stop the polling interval
          return;
        }

        const authStatus = await auth.getAuthStatus(
          constructAuthMachineState(workspace)
        );
        if (!isSystemAdministratorAuth(authStatus)) {
          usbDebug('Not logged in as system admin, not configuring');
          hadConfigurationError = false;
          return;
        }

        const usbDriveStatus = await usbDrive.status();
        if (usbDriveStatus.status !== 'mounted') {
          workspace.store.setConfigurationStatus(undefined);
          hadConfigurationError = false;
          return;
        }
        if (hadConfigurationError) {
          return;
        }
        usbDebug('Found USB drive mounted at %s', usbDriveStatus.mountPoint);

        workspace.store.setConfigurationStatus('loading');
        const files = await readdir(usbDriveStatus.mountPoint);
        const pollbookFiles = files
          .filter(
            (file) =>
              file.startsWith(POLLBOOK_PACKAGE_FILENAME_PREFIX) &&
              file.endsWith('.zip')
          )
          .map((file) => join(usbDriveStatus.mountPoint, file));
        if (pollbookFiles.length === 0) {
          workspace.store.setConfigurationStatus('not-found-usb');
          hadConfigurationError = true;
          pollingIntervalLock = false;
          return;
        }
        const mostRecentPollbookPackageFilePath = assertDefined(
          await iter(pollbookFiles)
            .async()
            .maxBy(async (filePath) => (await lstat(filePath)).ctime.getTime())
        );
        const pollbookPackageResult = await readPollbookPackage(
          mostRecentPollbookPackageFilePath
        );
        if (pollbookPackageResult.isErr()) {
          const result = pollbookPackageResult.err();
          debug('Read pollbook package error: %O', result);
          if (
            result.type === 'UnexpectedPrecinct' ||
            result.type === 'ReadFileError' ||
            (result.type === 'OpenFileError' &&
              'code' in result.error &&
              result.error.code === 'ENOENT')
          ) {
            workspace.store.setConfigurationStatus('usb-configuration-error');
            hadConfigurationError = true;
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
          createReadStream(mostRecentPollbookPackageFilePath),
          createWriteStream(
            join(workspace.assetDirectoryPath, POLLBOOK_PACKAGE_ASSET_FILE_NAME)
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
        // If we saved the election already, rollback
        workspace.store.deleteElectionAndVoters();

        // Return early to ensure clean exit from this iteration
        return;
      } finally {
        pollingIntervalLock = false; // Reset the flag to allow the next iteration
      }
    }, CONFIGURATION_POLLING_INTERVAL);
  });
}

export function pollNetworkForPollbookPackage({
  auth,
  workspace,
}: PeerAppContext): void {
  usbDebug('Polling network for pollbook package');
  if (workspace.store.getElection()) {
    return;
  }
  let pollingIntervalLock = false; // Flag to prevent overlapping executions
  let hadConfigurationError = false;

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

        const authStatus = await auth.getAuthStatus(
          constructAuthMachineState(workspace)
        );
        if (!isElectionManagerAuth(authStatus)) {
          if (!isSystemAdministratorAuth(authStatus)) {
            workspace.store.setConfigurationStatus(undefined);
          }
          usbDebug('Not logged in as election manager, not configuring');
          hadConfigurationError = false;
          return;
        }
        if (hadConfigurationError) {
          return;
        }
        const cardElectionId = authStatus.user.electionKey.id;
        const pollbooksOnNetwork = workspace.store.getPollbookServicesByName();
        const configuredPollbooks = Object.values(pollbooksOnNetwork).filter(
          (pollbook) =>
            pollbook.status ===
              PollbookConnectionStatus.MismatchedConfiguration &&
            pollbook.electionId
        );
        if (configuredPollbooks.length === 0) {
          workspace.store.setConfigurationStatus('not-found-network');
          return;
        }

        const matchingConfiguredPollbooks = configuredPollbooks.filter(
          (p) => p.electionId === cardElectionId
        );
        if (matchingConfiguredPollbooks.length === 0) {
          workspace.store.setConfigurationStatus(
            'not-found-configuration-matching-election-card'
          );
          return;
        }

        const allPollbooksHashesMatch =
          matchingConfiguredPollbooks.length > 0 &&
          matchingConfiguredPollbooks.every(
            (pollbook) =>
              pollbook.electionBallotHash ===
                matchingConfiguredPollbooks[0].electionBallotHash &&
              pollbook.pollbookPackageHash ===
                matchingConfiguredPollbooks[0].pollbookPackageHash
          );
        if (!allPollbooksHashesMatch) {
          workspace.store.setConfigurationStatus(
            'network-conflicting-pollbook-packages-match-card'
          );
          return;
        }

        workspace.store.setConfigurationStatus('loading');
        // We can now attempt to configure to the matching pollbooks
        for (const pollbook of matchingConfiguredPollbooks) {
          const { machineId } = pollbook;
          const result = await workspace.store.configureFromPeerMachine(
            workspace.assetDirectoryPath,
            machineId
          );
          // Check if we have successfully configured!
          if (result.isOk()) {
            workspace.store.setConfigurationStatus(undefined);
            clearInterval(intervalId); // Stop the polling interval
            return;
          }
        }
        // If we made it here all machines failed when we tried to configure from them
        workspace.store.setConfigurationStatus('network-configuration-error');
        hadConfigurationError = true;
      } finally {
        pollingIntervalLock = false; // Reset the flag to allow the next iteration
      }
    }, CONFIGURATION_POLLING_INTERVAL);
  });
}
