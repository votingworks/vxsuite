import { Buffer } from 'node:buffer';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { rename, rm, writeFile } from 'node:fs/promises';
import { err, ok, Result } from '@votingworks/basics';
import { exchangePaths } from '@votingworks/fs';
import { generateElectionBasedSubfolderName } from '@votingworks/utils';
import { prepare, PrepareError } from './prepare_step.js';
import { PrepareBackupOptions } from './types.js';
import { copy } from './copy_step.js';
import { BackupManifest } from '../backup_manifest.js';

/**
 */
export type RunBackupCreateError =
  | PrepareError
  | { type: 'backup-swap-failed'; message: string };

/**
 * Creates a full backup of the currently configured election, including the
 * database, ballot images, and election packages.
 */
export async function createBackup(
  options: PrepareBackupOptions
): Promise<Result<void, RunBackupCreateError>> {
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

  const manifestPath = join(inProgressBackupPath, 'manifest.json');
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  await writeFile(manifestPath, manifestBytes);

  // TODO: sign the manifest

  if (existsSync(backupPath)) {
    // Atomically swap the new backup into place: `renameat2(RENAME_EXCHANGE)`
    // guarantees that at no point does `backupPath` fail to name a valid
    // backup, unlike a plain rename-aside-then-rename-in dance, which has a
    // window where a crash leaves no backup at `backupPath` at all.
    // `inProgressBackupPath` now names the previous backup, which we discard.
    const exchangeResult = exchangePaths(backupPath, inProgressBackupPath);
    if (exchangeResult.isErr()) {
      return err({
        type: 'backup-swap-failed',
        message: `Failed to swap in the new backup: ${
          exchangeResult.err().message
        }`,
      });
    }
  } else {
    await rename(inProgressBackupPath, backupPath);
  }
  await rm(inProgressBackupPath, { recursive: true, force: true });

  return ok();
}
