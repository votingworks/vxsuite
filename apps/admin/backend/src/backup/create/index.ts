import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { Result } from '@votingworks/basics';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import { prepare, PrepareError } from './prepare_step.js';
import { PrepareBackupOptions } from './types.js';
import { copy } from './copy_step.js';
import { writeManifest } from './manifest_step.js';
import { swap, SwapError } from './swap_step.js';
import { BackupManifest } from '../backup_manifest.js';

/**
 * Possible expected errors that can occur when creating a backup.
 */
export type CreateBackupError = PrepareError | SwapError;

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

  await rm(inProgressBackupPath, { recursive: true, force: true });

  let manifest: BackupManifest;

  try {
    manifest = await copy({
      source,
      store,
      electionRecord,
      backup: inProgressBackupPath,
      logger: options.logger,
      onProgressEvent: options.onProgressEvent,
    });
  } finally {
    // Close the snapshot's connection before deleting the file it holds open,
    // or the space it occupies won't be reclaimed until we exit.
    store.close();
    await source.cleanup();
  }

  await writeManifest({
    manifest,
    backup: inProgressBackupPath,
    logger: options.logger,
    onProgressEvent: options.onProgressEvent,
  });

  return await swap({
    inProgressBackup: inProgressBackupPath,
    backup: backupPath,
    logger: options.logger,
    onProgressEvent: options.onProgressEvent,
  });
}
