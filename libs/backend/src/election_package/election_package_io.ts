import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import readline from 'node:readline';
import {
  Result,
  assert,
  assertDefined,
  deepEqual,
  err,
  iter,
  ok,
} from '@votingworks/basics';
import {
  ELECTION_PACKAGE_FOLDER,
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
  getEntries,
  getEntryStream,
  getFileByName,
  maybeGetFileByName,
  openZip,
  readTextEntry,
  systemLimitViolationToString,
} from '@votingworks/utils';
import * as fs from 'node:fs/promises';
import { LogEventId, BaseLogger } from '@votingworks/logging';
import {
  ElectionPackage,
  ElectionPackageConfigurationError,
  DippedSmartCardAuth,
  InsertedSmartCardAuth,
  DEFAULT_SYSTEM_SETTINGS,
  ElectionPackageFileName,
  UiStringAudioClip,
  UiStringAudioClipSchema,
  UiStringAudioIdsPackageSchema,
  UiStringsPackageSchema,
  safeParseJson,
  safeParseSystemSettings,
  ElectionPackageMetadata,
  ElectionPackageMetadataSchema,
  mergeUiStrings,
  UiStringAudioIdsPackage,
  safeParseElectionDefinition,
  constructElectionKey,
  ElectionPackageWithHash,
  EncodedBallotEntry,
  EncodedBallotEntrySchema,
  SystemLimitViolation,
  SystemLimits,
} from '@votingworks/types';
import { authenticateArtifactUsingSignatureFile } from '@votingworks/auth';
import { UsbDrive } from '@votingworks/usb-drive';
import { sha256 } from 'js-sha256';
import { validateElectionDefinitionAgainstSystemLimits } from './system_limits';

/**
 * An error from parsing an election package.
 */
export type ElectionPackageError =
  | {
      type:
        | 'invalid-election'
        | 'invalid-metadata'
        | 'invalid-system-settings'
        | 'invalid-zip';
    }
  | {
      type: 'system-limit-violation';
      violation: SystemLimitViolation;
    };

interface ReadElectionPackageOptions {
  checkMarkScanSystemLimits?: boolean;
  checkMarkSystemLimits?: boolean;
  systemLimitsOverride?: SystemLimits;
}

/**
 * Parses an package from the given buffer and hashes the raw contents.
 */
export async function readElectionPackageFromBuffer(
  fileContents: Buffer,
  options?: ReadElectionPackageOptions
): Promise<Result<ElectionPackageWithHash, ElectionPackageError>> {
  try {
    const zipFile = await openZip(fileContents);
    const zipName = 'election package';
    const entries = getEntries(zipFile);
    const electionEntry = getFileByName(
      entries,
      ElectionPackageFileName.ELECTION,
      zipName
    );

    // Metadata:

    let metadata: ElectionPackageMetadata | undefined;
    const metadataEntry = maybeGetFileByName(
      entries,
      ElectionPackageFileName.METADATA
    );
    if (metadataEntry) {
      const metadataText = await readTextEntry(metadataEntry);
      const metadataResult = safeParseJson(
        metadataText,
        ElectionPackageMetadataSchema
      );
      if (metadataResult.isErr()) {
        return err({
          type: 'invalid-metadata',
          message: metadataResult.err().message,
        });
      }
      metadata = metadataResult.ok();
    }

    // System Settings:

    let systemSettingsData = JSON.stringify(DEFAULT_SYSTEM_SETTINGS);

    const systemSettingsEntry = maybeGetFileByName(
      entries,
      ElectionPackageFileName.SYSTEM_SETTINGS
    );
    if (systemSettingsEntry) {
      systemSettingsData = await readTextEntry(systemSettingsEntry);
    }
    const systemSettingsResult = safeParseSystemSettings(systemSettingsData);
    if (systemSettingsResult.isErr()) {
      return err({
        type: 'invalid-system-settings',
        message: systemSettingsResult.err().message,
      });
    }
    const systemSettings = systemSettingsResult.ok();

    // Election Definition:

    const electionData = await readTextEntry(electionEntry);
    const electionResult = safeParseElectionDefinition(electionData);
    if (electionResult.isErr()) {
      return err({
        type: 'invalid-election',
        message: electionResult.err().message,
      });
    }
    const electionDefinition = electionResult.ok();

    // UI Strings:

    const appStringsEntry = maybeGetFileByName(
      entries,
      ElectionPackageFileName.APP_STRINGS
    );
    const appStrings =
      appStringsEntry &&
      safeParseJson(
        await readTextEntry(appStringsEntry),
        UiStringsPackageSchema
      ).unsafeUnwrap();

    const uiStrings = mergeUiStrings(
      appStrings ?? {},
      electionDefinition.election.ballotStrings
    );

    // UI String Audio IDs:

    let uiStringAudioIds: UiStringAudioIdsPackage | undefined;
    const audioIdsEntry = maybeGetFileByName(
      entries,
      ElectionPackageFileName.AUDIO_IDS
    );
    if (audioIdsEntry) {
      uiStringAudioIds = safeParseJson(
        await readTextEntry(audioIdsEntry),
        UiStringAudioIdsPackageSchema
      ).unsafeUnwrap();
    }

    // UI String Clips:

    const uiStringAudioClips: UiStringAudioClip[] = [];
    const audioClipsEntry = maybeGetFileByName(
      entries,
      ElectionPackageFileName.AUDIO_CLIPS
    );
    if (audioClipsEntry) {
      const audioClipsFileLines = readline.createInterface(
        getEntryStream(audioClipsEntry)
      );

      for await (const line of audioClipsFileLines) {
        uiStringAudioClips.push(
          safeParseJson(line, UiStringAudioClipSchema).unsafeUnwrap()
        );
      }
    }

    // Ballots:
    // "Entry" in EncodedBallotEntry refers to a line as an entry in a JSONL file.
    const ballots: EncodedBallotEntry[] = [];
    // "Entry" in "ballotsEntry" refers to a file as an entry in a zip file.
    const ballotsEntry = maybeGetFileByName(
      entries,
      ElectionPackageFileName.BALLOTS
    );
    if (ballotsEntry) {
      const ballotsFileLines = readline.createInterface(
        getEntryStream(ballotsEntry)
      );

      for await (const line of ballotsFileLines) {
        ballots.push(
          safeParseJson(line, EncodedBallotEntrySchema).unsafeUnwrap()
        );
      }
    }

    // TODO(kofi): Verify package version matches machine build version.

    const electionPackage: ElectionPackage = {
      ballots,
      electionDefinition,
      metadata,
      systemSettings,
      uiStrings,
      uiStringAudioIds,
      uiStringAudioClips,
    };

    if (!systemSettings.disableSystemLimitChecks) {
      const validationResult = validateElectionDefinitionAgainstSystemLimits(
        electionDefinition,
        options
      );
      if (validationResult.isErr()) {
        return err({
          type: 'system-limit-violation',
          violation: validationResult.err(),
        });
      }
    }

    return ok({
      electionPackage,
      electionPackageHash: sha256(fileContents),
    });
  } catch (error) {
    return err({
      type: 'invalid-zip',
      message: String(error),
    });
  }
}

/**
 * An {@link ElectionPackageWithHash} object, with the raw contents of the zip file included
 */
export type ElectionPackageWithFileContents = ElectionPackageWithHash & {
  fileContents: Buffer;
};

/**
 * Attempts to read an election package from the given filepath and parse the contents.
 */
export async function readElectionPackageFromFile(
  path: string,
  options?: ReadElectionPackageOptions
): Promise<Result<ElectionPackageWithFileContents, ElectionPackageError>> {
  const fileContents = await fs.readFile(path);
  const result = await readElectionPackageFromBuffer(fileContents, options);
  return result.isErr() ? result : ok({ ...result.ok(), fileContents });
}

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
    return err({ type: 'no_election_package_on_usb_drive' });
  }

  const mostRecentElectionPackageFilePath = assertDefined(
    await iter(electionPackageFilePaths)
      .async()
      .maxBy(async (filePath) => (await fs.lstat(filePath)).ctime.getTime())
  );

  return ok(mostRecentElectionPackageFilePath);
}

/**
 * readSignedElectionPackageFromUsb validates desired auth and USB state and
 * returns the election package from a USB drive if possible, or an error if not
 * possible.
 * @param authStatus AuthStatus representing an inserted card
 * @param usbDrive UsbDrive representing status of an inserted USB drive
 * @param logger A Logger instance
 * @returns Result<ElectionPackage, ElectionPackageConfigurationError> intended to be consumed by an API handler
 */
export async function readSignedElectionPackageFromUsb(
  authStatus: DippedSmartCardAuth.AuthStatus | InsertedSmartCardAuth.AuthStatus,
  usbDrive: UsbDrive,
  logger: BaseLogger,
  options?: ReadElectionPackageOptions
): Promise<Result<ElectionPackageWithHash, ElectionPackageConfigurationError>> {
  // The frontend tries to prevent election package configuration attempts until an election
  // manager has authed. But we may reach this state if a user removes their card immediately
  // after inserting it, but after the election package configuration attempt has started
  if (authStatus.status !== 'logged_in') {
    logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message: 'Election package configuration was attempted before auth.',
    });
    return err({ type: 'auth_required_before_election_package_load' });
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
    logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message: 'Election package authentication erred.',
    });
    return err({ type: 'election_package_authentication_error' });
  }

  const electionPackageWithHashResult = await readElectionPackageFromFile(
    filepathResult.ok(),
    options
  );
  if (electionPackageWithHashResult.isErr()) {
    const error = electionPackageWithHashResult.err();
    // No other cases should be possible if an election package was signed by VxAdmin and
    // authenticated by the current machine
    assert(error.type === 'system-limit-violation');
    logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message: systemLimitViolationToString(error.violation),
    });
    return err({
      type: 'system_limit_violation',
      violation: error.violation,
    });
  }
  const electionPackageWithHash = electionPackageWithHashResult.unsafeUnwrap();
  const electionKey = constructElectionKey(
    electionPackageWithHash.electionPackage.electionDefinition.election
  );

  if (!deepEqual(authStatus.user.electionKey, electionKey)) {
    logger.log(LogEventId.ElectionPackageLoadedFromUsb, 'system', {
      disposition: 'failure',
      message:
        'The election key for the authorized user and most recent election package on the USB drive did not match.',
    });
    return err({ type: 'election_key_mismatch' });
  }

  return ok(electionPackageWithHash);
}
