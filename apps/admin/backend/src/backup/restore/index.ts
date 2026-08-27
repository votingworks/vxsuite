import { resolve } from 'node:path';
import { Result } from '@votingworks/basics';
import { BaseLogger, LogEventId } from '@votingworks/logging';
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

export { RESTORE_IN_PROGRESS_MARKER_FILENAME } from './prepare_step.js';

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
 */
export async function restoreBackup(
  rawOptions: RestoreBackupOptions
): Promise<Result<void, RestoreError>> {
  // Resolve the caller-supplied paths up front, as `createBackup` does, so the
  // workspace paths `openWorkspace` resolves and the paths we log and derive
  // here agree.
  const options: RestoreBackupOptions = {
    ...rawOptions,
    workspace: resolve(rawOptions.workspace),
    backup: resolve(rawOptions.backup),
  };
  const { logger } = options;
  logger.log(LogEventId.BackupRestoreInit, 'system', {
    message: `Restoring a backup from ${options.backup}…`,
  });

  return logRestoreResult(logger, await tryRestoreBackup(options));
}

async function tryRestoreBackup(
  options: RestoreBackupOptions
): Promise<Result<void, RestoreError>> {
  const { logger, onProgressEvent } = options;
  onProgressEvent?.({ type: 'preparing' });

  const checkResult = checkWorkspaceIsRestorable(options.workspace, logger);
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
    workspacePath: options.workspace,
    manifest,
    minAvailableStorageBytes: options.minAvailableStorageBytes,
  });
  if (spaceResult.isErr()) {
    return spaceResult;
  }

  await claimWorkspace(options.workspace);
  let succeeded = false;
  try {
    const copyResult = await copyBackupFiles({
      backup,
      manifest,
      workspacePath: options.workspace,
      onProgressEvent,
      progressEventIntervalBytes: options.progressEventIntervalBytes,
    });
    if (copyResult.isErr()) {
      return copyResult;
    }

    onProgressEvent?.({ type: 'verifying' });
    const verifyResult = verifyRestoredWorkspace({
      manifest,
      workspacePath: options.workspace,
      logger,
    });
    if (verifyResult.isErr()) {
      return verifyResult;
    }

    // Flushed before the marker comes off: removing the marker declares the
    // restore complete, which must not happen while the restored files live
    // only in the page cache.
    onProgressEvent?.({ type: 'flushing_workspace' });
    const flushResult = await flushRestoredWorkspace(options.workspace);
    succeeded = flushResult.isOk();
    return flushResult;
  } finally {
    if (succeeded) {
      await completeRestore(options.workspace);
    } else {
      await abandonFailedRestore(options.workspace);
    }
  }
}

function logRestoreResult(
  logger: BaseLogger,
  result: Result<void, RestoreError>
): Result<void, RestoreError> {
  if (result.isOk()) {
    logger.log(LogEventId.BackupRestoreComplete, 'system', {
      disposition: 'success',
      message: 'Backup restored successfully.',
    });
  } else {
    const error = result.err();
    logger.log(LogEventId.BackupRestoreComplete, 'system', {
      disposition: 'failure',
      errorType: error.type,
      message: `Failed to restore backup: ${error.message}`,
    });
  }
  return result;
}
