import { join } from 'path';
import {
  Result,
  assert,
  assertDefined,
  err,
  iter,
  ok,
} from '@votingworks/basics';
import {
  ELECTION_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  readElectionPackageFromBuffer,
} from '@votingworks/utils';
import * as fs from 'fs/promises';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  ElectionPackage,
  ElectionPackageConfigurationError,
  DippedSmartCardAuth,
  InsertedSmartCardAuth,
} from '@votingworks/types';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import { UsbDrive } from '@votingworks/usb-drive';

async function getMostRecentElectionPackageFilepath(
  usbDrive: UsbDrive
): Promise<Result<string, ElectionPackageConfigurationError>> {
  const usbDriveStatus = await usbDrive.status();
  assert(usbDriveStatus.status === 'mounted', 'No USB drive mounted');

  // Although not all USB drive root directories are election directories, we
  // just check them all. It's not necessary to enforce the naming convention.
  const possibleElectionDirectories = (
    await fs.readdir(usbDriveStatus.mountPoint, {
      withFileTypes: true,
    })
  ).filter((entry) => entry.isDirectory());

  const electionElectionPackageDirectories: string[] = [];
  for (const possibleElectionDirectory of possibleElectionDirectories) {
    const hasElectionPackageDirectory = (
      await fs.readdir(
        join(usbDriveStatus.mountPoint, possibleElectionDirectory.name),
        {
          withFileTypes: true,
        }
      )
    ).some(
      (entry) => entry.isDirectory() && entry.name === ELECTION_PACKAGE_FOLDER
    );

    if (hasElectionPackageDirectory) {
      electionElectionPackageDirectories.push(
        join(
          usbDriveStatus.mountPoint,
          possibleElectionDirectory.name,
          ELECTION_PACKAGE_FOLDER
        )
      );
    }
  }

  const electionPackageFilePaths: string[] = [];
  for (const electionElectionPackageDirectory of electionElectionPackageDirectories) {
    electionPackageFilePaths.push(
      ...(
        await fs.readdir(electionElectionPackageDirectory, {
          withFileTypes: true,
        })
      )
        .filter(
          (file) =>
            file.isFile() &&
            file.name.endsWith('.zip') &&
            // Ignore hidden files that start with `.`
            !file.name.startsWith('.')
        )
        .map((file) => join(electionElectionPackageDirectory, file.name))
    );
  }

  if (electionPackageFilePaths.length === 0) {
    return err('no_election_package_on_usb_drive');
  }

  const mostRecentElectionPackageFilePath = assertDefined(
    await iter(electionPackageFilePaths)
      .async()
      .maxBy(async (filePath) => (await fs.lstat(filePath)).ctime.getTime())
  );

  return ok(mostRecentElectionPackageFilePath);
}

/**
 * readElectionPackageFromUsb validates desired auth and USB state and returns the election package
 * from a USB drive if possible, or an error if not possible.
 * @param authStatus AuthStatus representing an inserted card
 * @param usbDrive UsbDrive representing status of an inserted USB drive
 * @param logger A Logger instance
 * @returns Result<ElectionPackage, ElectionPackageConfigurationError> intended to be consumed by an API handler
 */
export async function readElectionPackageFromUsb(
  authStatus: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus,
  usbDrive: UsbDrive,
  logger: Logger
): Promise<Result<ElectionPackage, ElectionPackageConfigurationError>> {
  // The frontend tries to prevent election package configuration attempts until an election
  // manager has authed. But we may reach this state if a user removes their card immediately
  // after inserting it, but after the election package configuration attempt has started
  if (authStatus.status !== 'logged_in') {
    await logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message: 'Election package configuration was attempted before auth.',
    });
    return err('auth_required_before_election_package_load');
  }

  // The frontend should prevent non-election manager auth, so we are fine
  // a simple assert to enforce
  assert(
    authStatus.user.role === 'election_manager',
    'Only election managers may configure an election package.'
  );

  const filepathResult = await getMostRecentElectionPackageFilepath(usbDrive);
  if (filepathResult.isErr()) {
    return filepathResult;
  }

  const artifactAuthenticationResult = isFeatureFlagEnabled(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  )
    ? ok()
    : await authenticateArtifactUsingSignatureFile({
        type: 'election_package',
        filePath: filepathResult.ok(),
      });
  if (artifactAuthenticationResult.isErr()) {
    await logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message: 'Election package authentication erred.',
    });
    return err('election_package_authentication_error');
  }

  const electionPackage = await readElectionPackageFromBuffer(
    await fs.readFile(filepathResult.ok())
  );

  const { electionDefinition } = electionPackage;

  if (authStatus.user.electionHash !== electionDefinition.electionHash) {
    await logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message:
        'The election hash for the authorized user and most recent election package on the USB drive did not match.',
    });
    return err('election_hash_mismatch');
  }

  return ok(electionPackage);
}
