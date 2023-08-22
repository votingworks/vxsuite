import path from 'path';
import { Result, assert, err, ok } from '@votingworks/basics';
import {
  BALLOT_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  readBallotPackageFromBuffer,
} from '@votingworks/utils';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { LogEventId, Logger } from '@votingworks/logging';
import {
  BallotPackage,
  BallotPackageConfigurationError,
  DippedSmartCardAuth,
  InsertedSmartCardAuth,
} from '@votingworks/types';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import { UsbDrive } from '../get_usb_drives';

async function getMostRecentBallotPackageFilepath(
  usbDrive: UsbDrive
): Promise<Result<string, BallotPackageConfigurationError>> {
  assert(usbDrive?.mountPoint !== undefined, 'No USB drive mounted');

  const directoryPath = path.join(usbDrive.mountPoint, BALLOT_PACKAGE_FOLDER);
  if (!fsSync.existsSync(directoryPath)) {
    return err('no_ballot_package_on_usb_drive');
  }

  const files = await fs.readdir(directoryPath, { withFileTypes: true });
  const ballotPackageFiles = files.filter(
    (file) =>
      // Ignore hidden files that start with `.`
      file.isFile() && !file.name.startsWith('.') && file.name.endsWith('.zip')
  );
  if (ballotPackageFiles.length === 0) {
    return err('no_ballot_package_on_usb_drive');
  }

  const ballotPackageFilesWithStats = await Promise.all(
    ballotPackageFiles.map(async (file) => {
      const filePath = path.join(directoryPath, file.name);
      return {
        ...file,
        filePath,
        // Include file stats so we can sort by creation time
        ...(await fs.lstat(filePath)),
      };
    })
  );

  const [mostRecentBallotPackageFile] = [...ballotPackageFilesWithStats].sort(
    (a, b) => b.ctime.getTime() - a.ctime.getTime()
  );
  assert(mostRecentBallotPackageFile);

  return ok(mostRecentBallotPackageFile.filePath);
}

/**
 * readBallotPackageFromUsb validates desired auth and USB state and returns the ballot package
 * from a USB drive if possible, or an error if not possible.
 * @param authStatus AuthStatus representing an inserted card
 * @param usbDrive UsbDrive representing status of an inserted USB drive
 * @param logger A Logger instance
 * @returns Result<BallotPackage, BallotPackageConfigurationError> intended to be consumed by an API handler
 */
export async function readBallotPackageFromUsb(
  authStatus: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus,
  usbDrive: UsbDrive,
  logger: Logger
): Promise<Result<BallotPackage, BallotPackageConfigurationError>> {
  // The frontend tries to prevent ballot package configuration attempts until an election
  // manager has authed. But we may reach this state if a user removes their card immediately
  // after inserting it, but after the ballot package configuration attempt has started
  if (authStatus.status !== 'logged_in') {
    await logger.log(LogEventId.BallotPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message: 'Ballot package configuration was attempted before auth.',
    });
    return err('auth_required_before_ballot_package_load');
  }

  // The frontend should prevent non-election manager auth, so we are fine
  // a simple assert to enforce
  assert(
    authStatus.user.role === 'election_manager',
    'Only election managers may configure a ballot package.'
  );

  const filepathResult = await getMostRecentBallotPackageFilepath(usbDrive);
  if (filepathResult.isErr()) {
    return filepathResult;
  }

  const artifactAuthenticationResult =
    await authenticateArtifactUsingSignatureFile({
      type: 'ballot_package',
      path: filepathResult.ok(),
    });
  if (
    artifactAuthenticationResult.isErr() &&
    !isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.SKIP_BALLOT_PACKAGE_AUTHENTICATION
    )
  ) {
    await logger.log(LogEventId.BallotPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message: 'Ballot package authentication erred.',
    });
    return err('ballot_package_authentication_error');
  }

  const ballotPackage = await readBallotPackageFromBuffer(
    await fs.readFile(filepathResult.ok())
  );

  const { electionDefinition } = ballotPackage;

  if (authStatus.user.electionHash !== electionDefinition.electionHash) {
    await logger.log(LogEventId.BallotPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message:
        'The election hash for the authorized user and most recent ballot package on the USB drive did not match.',
    });
    return err('election_hash_mismatch');
  }

  return ok(ballotPackage);
}
