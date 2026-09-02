import { dirname, resolve } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import {
  assertDefined,
  err,
  extractErrorMessage,
  ok,
  Result,
} from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { CopyFileError, WriteFileError } from '@votingworks/fs';
import { prepare, PrepareError } from './prepare_step.js';
import { PrepareBackupOptions } from './types.js';
import { copy } from './copy_step.js';
import { writeManifest } from './manifest_step.js';
import { swap, SwapError } from './swap_step.js';
import { BackupManifest } from '../backup_manifest.js';
import { BackupRoot } from '../backup_root.js';

/**
 * Possible expected errors that can occur while writing a backup's files to
 * the target.
 */
export interface WriteBackupError {
  type: 'backup-write-failed';
  message: string;
}

/**
 * Reported when the caller cancelled the backup.
 */
export interface CancelBackupError {
  type: 'cancelled';
  message: string;
}

/**
 * Possible expected errors that can occur when creating a backup.
 */
export type CreateBackupError =
  | PrepareError
  | WriteBackupError
  | CancelBackupError
  | SwapError;

/**
 * Error codes we expect from writing a backup to its target: the drive filling
 * up, being removed, being mounted read-only, or failing outright. Anything
 * else is a bug and crashes rather than being reported as a backup failure.
 */
const EXPECTED_WRITE_ERROR_CODES: readonly string[] = [
  'EACCES',
  'EIO',
  'ENOENT',
  'ENOSPC',
  'EPERM',
  'EROFS',
];

/**
 * A finished backup: where it landed, and the manifest describing it.
 */
export interface CreatedBackup {
  path: string;
  manifest: BackupManifest;
}

/**
 * Creates a full backup of the currently configured election, including the
 * database, ballot images, and election packages.
 */
export async function createBackup(
  rawOptions: PrepareBackupOptions
): Promise<Result<CreatedBackup, CreateBackupError>> {
  // The staging area requires absolute paths, so resolve what the caller gave
  // us up front and use the same absolute path everywhere.
  const options: PrepareBackupOptions = {
    ...rawOptions,
    target: resolve(rawOptions.target),
  };
  const { logger } = options;
  await logger.logAsCurrentRole(LogEventId.BackupCreateInit, {
    message: `Creating a backup at ${options.target}...`,
  });

  const result = await tryCreateBackup(options);

  if (result.isOk()) {
    await logger.logAsCurrentRole(LogEventId.BackupCreateComplete, {
      disposition: 'success',
      message: `Backup created successfully at ${result.ok().path}.`,
    });
  } else {
    const error = result.err();
    await logger.logAsCurrentRole(LogEventId.BackupCreateComplete, {
      disposition: 'failure',
      errorType: error.type,
      message: `Failed to create backup: ${error.message}`,
    });
  }

  return result;
}

/**
 * Reported when the caller cancelled the backup.
 */
const CANCELLED_ERROR: CreateBackupError = {
  type: 'cancelled',
  message: 'Backup cancelled',
};

const NOT_REGULAR_FILE_MESSAGE =
  'The backup target holds something that is not a regular file';

function describeFileFailure(
  error: Exclude<CopyFileError, { type: 'Cancelled' }> | WriteFileError
): string {
  switch (error.type) {
    case 'FileExceedsMaxSize': {
      return `A staged file grew past its measured size (max ${error.maxSize} bytes)`;
    }

    /* @coverage-exclude: the staging area only ever links regular files,
       having stat'd each one before staging it */
    case 'SourceNotRegularFile': {
      return 'A staged file is no longer a regular file';
    }

    /* @coverage-exclude: requires the target to substitute something for a
       path between the run clearing it and the copy reaching it */
    case 'DestinationNotRegularFile': {
      return NOT_REGULAR_FILE_MESSAGE;
    }

    case 'NotRegularFile': {
      return NOT_REGULAR_FILE_MESSAGE;
    }

    default: {
      return extractErrorMessage(error.error);
    }
  }
}

/**
 * Throws away a backup that will never be finished. Best effort: whatever
 * stopped the write may stop the cleanup too, and the next run clears the path
 * before it writes anything.
 */
async function discardInProgressBackup(
  inProgressBackupPath: string
): Promise<void> {
  try {
    await rm(inProgressBackupPath, { recursive: true, force: true });
  } catch {
    // ignored
  }
}

async function tryCreateBackup(
  options: PrepareBackupOptions
): Promise<Result<CreatedBackup, CreateBackupError>> {
  const prepareResult = await prepare(options);
  if (prepareResult.isErr()) {
    return prepareResult;
  }

  const { electionId, source, snapshotStore } = prepareResult.ok();

  const electionBackupName = assertDefined(
    snapshotStore.getElectionBasedSubfolderName(electionId),
    'the election `prepare` found must still be in the snapshot it took'
  );

  const root = new BackupRoot(options.target);
  const backupPath = root.pathFor(electionBackupName);
  const inProgressBackupPath = root.pathFor(
    `${electionBackupName}-in-progress`
  );

  let manifest: BackupManifest;

  try {
    try {
      // The backups directory may not exist yet on a drive that has never been
      // backed up to.
      await mkdir(dirname(inProgressBackupPath), { recursive: true });

      // Clear the leftovers of any interrupted run before writing.
      await rm(inProgressBackupPath, { recursive: true, force: true });

      const copyResult = await copy({
        electionId,
        source,
        store: snapshotStore,
        backup: inProgressBackupPath,
        logger: options.logger,
        onProgressEvent: options.onProgressEvent,
        signal: options.signal,
      });
      if (copyResult.isErr()) {
        const error = copyResult.err();

        await discardInProgressBackup(inProgressBackupPath);

        if (error.type === 'Cancelled') {
          return err(CANCELLED_ERROR);
        }

        return err({
          type: 'backup-write-failed',
          message: describeFileFailure(error),
        });
      }
      manifest = copyResult.ok();
    } finally {
      // Close the snapshot's connection before deleting the file it holds
      // open, or the space it occupies won't be reclaimed until we exit.
      snapshotStore.close();
      await source.cleanup();
    }

    // The last point a backup can be abandoned cheaply: past the swap below
    // there is a new backup in place of the old one, and the operator is
    // better served by a finished backup than by a half-swapped directory.
    if (options.signal?.aborted) {
      await discardInProgressBackup(inProgressBackupPath);
      return err(CANCELLED_ERROR);
    }

    const writeManifestResult = await writeManifest({
      manifest,
      backup: inProgressBackupPath,
      logger: options.logger,
      onProgressEvent: options.onProgressEvent,
    });

    if (writeManifestResult.isErr()) {
      await discardInProgressBackup(inProgressBackupPath);

      return err({
        type: 'backup-write-failed',
        message: describeFileFailure(writeManifestResult.err()),
      });
    }
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (!code || !EXPECTED_WRITE_ERROR_CODES.includes(code)) {
      throw error;
    }

    // The backup at its final path is still intact, so what this run managed
    // to write is discarded rather than left for a later run to clean up.
    await discardInProgressBackup(inProgressBackupPath);

    return err({
      type: 'backup-write-failed',
      message: extractErrorMessage(error),
    });
  }

  const swapResult = await swap({
    inProgressBackup: inProgressBackupPath,
    target: options.target,
    backup: backupPath,
    logger: options.logger,
    onProgressEvent: options.onProgressEvent,
  });
  if (swapResult.isErr()) {
    return swapResult;
  }

  return ok({ path: backupPath, manifest });
}
