import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { err, extractErrorMessage, Result } from '@votingworks/basics';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import { prepare, PrepareError } from './prepare_step.js';
import { PrepareBackupOptions } from './types.js';
import { copy } from './copy_step.js';
import { writeManifest } from './manifest_step.js';
import { swap, SwapError } from './swap_step.js';
import { BackupManifest } from '../backup_manifest.js';

/**
 * Possible expected errors that can occur while writing a backup's files to
 * the target.
 */
export interface WriteBackupError {
  type: 'backup-write-failed';
  message: string;
}

/**
 * Possible expected errors that can occur when creating a backup.
 */
export type CreateBackupError = PrepareError | WriteBackupError | SwapError;

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
 * Creates a full backup of the currently configured election, including the
 * database, ballot images, and election packages.
 */
export async function createBackup(
  options: PrepareBackupOptions
): Promise<Result<void, CreateBackupError>> {
  const prepareResult = await prepare(options);
  if (prepareResult.isErr()) {
    return prepareResult;
  }

  const { source, store, electionRecord } = prepareResult.ok();

  const electionBackupName = generateElectionBasedSubfolderName(
    electionRecord.electionDefinition.election,
    electionRecord.electionDefinition.ballotHash
  );

  const backupPath = join(options.target, electionBackupName);

  const inProgressBackupPath = join(
    options.target,
    `${electionBackupName}-in-progress`
  );

  try {
    let manifest: BackupManifest;

    try {
      // Clear the leftovers of any interrupted run before writing.
      await rm(inProgressBackupPath, { recursive: true, force: true });

      manifest = await copy({
        source,
        store,
        electionRecord,
        backup: inProgressBackupPath,
        logger: options.logger,
        onProgressEvent: options.onProgressEvent,
      });
    } finally {
      // Close the snapshot's connection before deleting the file it holds
      // open, or the space it occupies won't be reclaimed until we exit.
      store.close();
      await source.cleanup();
    }

    await writeManifest({
      manifest,
      backup: inProgressBackupPath,
      logger: options.logger,
      onProgressEvent: options.onProgressEvent,
    });
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (!code || !EXPECTED_WRITE_ERROR_CODES.includes(code)) {
      throw error;
    }

    // The backup at its final path is still intact, so discard what we managed
    // to write instead of leaving it for a later run to clean up. Best effort:
    // whatever stopped the write may stop the cleanup too, and the next run
    // clears the path before it writes anything.
    try {
      await rm(inProgressBackupPath, { recursive: true, force: true });
    } catch {
      // ignored
    }

    return err({
      type: 'backup-write-failed',
      message: extractErrorMessage(error),
    });
  }

  return await swap({
    inProgressBackup: inProgressBackupPath,
    backup: backupPath,
    logger: options.logger,
    onProgressEvent: options.onProgressEvent,
  });
}
