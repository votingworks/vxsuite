import { resolve } from 'node:path';
import { err, Result } from '@votingworks/basics';
import { Logger, LogEventId } from '@votingworks/logging';
import { copyBackupFiles } from './copy_step.js';
import { openBackup, vetManifest } from './open_step.js';
import {
  abandonFailedRestore,
  checkWorkspaceHasSufficientSpace,
  checkWorkspaceIsRestorable,
  claimWorkspace,
  completeRestore,
} from './prepare_step.js';
import { RestoreBackupOptions, RestoreError } from './types.js';
import {
  flushRestoredWorkspace,
  verifyRestoredWorkspace,
} from './verify_step.js';

/**
 * Restores a backup from disk, typically an external USB drive. Includes the
 * database, ballot images, and election packages.
 *
 * The workspace's contents belong to the restore: it is emptied before copying
 * begins and again if the restore fails, so the result is exactly what the
 * backup provided or nothing. All vetting of the backup happens before the
 * workspace is touched, so a backup that was never going to restore leaves it
 * as it was. Aborts if the destination workspace is already configured with a
 * current election — unless a marker left by an interrupted restore shows that
 * the apparent configuration is half-restored debris, in which case the
 * restore is what recovers the workspace.
 *
 * Emptying the workspace means deleting its database, so nothing may have it
 * open: the caller names the workspace by path, and the restore opens the
 * database only to look at whether it holds an election, and only if there is
 * one to open. The machine that reads the result is the one that starts up
 * afterwards, and it finds either the restored database or none at all.
 */
export async function restoreBackup(
  rawOptions: RestoreBackupOptions
): Promise<Result<void, RestoreError>> {
  const options: RestoreBackupOptions = {
    ...rawOptions,
    backup: resolve(rawOptions.backup),
    workspacePath: resolve(rawOptions.workspacePath),
  };
  const { logger } = options;
  await logger.logAsCurrentRole(LogEventId.BackupRestoreInit, {
    message: `Restoring a backup from ${options.backup}…`,
  });

  return await logRestoreResult(logger, await tryRestoreBackup(options));
}

/**
 * Reported when the caller cancelled the restore.
 */
const CANCELLED_ERROR: RestoreError = {
  type: 'cancelled',
  message: 'Restore cancelled',
};

async function tryRestoreBackup(
  options: RestoreBackupOptions
): Promise<Result<void, RestoreError>> {
  const { logger, onProgressEvent, signal, workspacePath } = options;
  onProgressEvent?.({ type: 'preparing' });

  if (signal?.aborted) {
    return err(CANCELLED_ERROR);
  }

  const checkResult = await checkWorkspaceIsRestorable(workspacePath, logger);
  if (checkResult.isErr()) {
    return checkResult;
  }

  const openResult = await openBackup(options.backup);
  if (openResult.isErr()) {
    return openResult;
  }

  await using backup = openResult.ok();
  const vetResult = await vetManifest(backup, logger);
  if (vetResult.isErr()) {
    return vetResult;
  }
  const manifest = vetResult.ok();

  const spaceResult = await checkWorkspaceHasSufficientSpace({
    workspacePath,
    manifest,
    minAvailableStorageBytes: options.minAvailableStorageBytes,
  });
  if (spaceResult.isErr()) {
    return spaceResult;
  }

  // The last point a restore can be abandoned without touching the workspace:
  // claiming it empties it, so from here on the only way out is to empty it
  // again rather than to leave it as it was.
  if (signal?.aborted) {
    return err(CANCELLED_ERROR);
  }

  await claimWorkspace(workspacePath);
  let succeeded = false;
  try {
    const copyResult = await copyBackupFiles({
      backup,
      manifest,
      workspacePath,
      onProgressEvent,
      signal,
      progressEventIntervalBytes: options.progressEventIntervalBytes,
    });
    if (copyResult.isErr()) {
      return copyResult;
    }

    onProgressEvent?.({ type: 'verifying' });
    const verifyResult = verifyRestoredWorkspace({
      manifest,
      workspacePath,
      logger,
    });
    if (verifyResult.isErr()) {
      return verifyResult;
    }

    // Flushed before the marker comes off: removing the marker declares the
    // restore complete, which must not happen while the restored files live
    // only in the page cache.
    onProgressEvent?.({ type: 'flushing_workspace' });
    const flushResult = await flushRestoredWorkspace(workspacePath);
    succeeded = flushResult.isOk();
    return flushResult;
  } finally {
    if (succeeded) {
      await completeRestore(workspacePath);
    } else {
      await abandonFailedRestore(workspacePath);
    }
  }
}

async function logRestoreResult(
  logger: Logger,
  result: Result<void, RestoreError>
): Promise<Result<void, RestoreError>> {
  if (result.isOk()) {
    await logger.logAsCurrentRole(LogEventId.BackupRestoreComplete, {
      disposition: 'success',
      message: 'Backup restored successfully.',
    });
  } else {
    const error = result.err();
    await logger.logAsCurrentRole(LogEventId.BackupRestoreComplete, {
      disposition: 'failure',
      errorType: error.type,
      message: `Failed to restore backup: ${error.message}`,
    });
  }
  return result;
}
