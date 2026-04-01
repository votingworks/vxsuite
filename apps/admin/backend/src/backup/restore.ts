import { mkdir, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import makeDebug from 'debug';
import { assert, err, ok, Result } from '@votingworks/basics';
import { BaseLogger } from '@votingworks/logging';

import {
  BACKUP_DB_FILENAME,
  BACKUP_IMAGES_DIR,
  BACKUP_ROOT_DIR,
  BackupManifest,
  RESTORE_IN_PROGRESS_DIR,
  RestoreProgress,
} from './types';
import {
  cleanupDirSafe,
  cleanupSafe,
  copyFileWithHash,
  getAvailableDiskSpace,
  ignoreMissing,
} from './fs_utils';
import { BackupStopReason, validateBackup } from './backup';
import {
  WORKSPACE_BALLOT_IMAGES_DIR,
  WORKSPACE_DB_FILENAME,
} from '../util/workspace';

const debug = makeDebug('admin:restore');

/** Context needed to perform a restore operation. */
export interface RestoreContext {
  /** Path to the workspace directory, used for staging restored files and disk space checks. */
  readonly workspacePath: string;
  /** Destination path for the restored SQLite database file. */
  readonly dbPath: string;
  /** Destination path for the restored ballot image files. */
  readonly ballotImagesPath: string;
  /** Mount point of the USB drive containing the backup. */
  readonly backupDriveMountPoint: string;
  /** Name of the backup subdirectory on the USB drive to restore from. */
  readonly backupDirectoryName: string;
  /** Software version string checked against the backup manifest for compatibility. */
  readonly softwareVersion: string;
  readonly logger: BaseLogger;
  /** Optional callback invoked as the restore progresses through phases. */
  onProgress?: (progress: RestoreProgress) => void;
  /** Signal to cancel the restore operation. */
  signal?: AbortSignal;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Restore workspace data from a backup on a USB drive.
 *
 * Designed to be safe and atomic — if anything fails, the previous
 * workspace data is restored.
 */
export async function performRestore(
  ctx: RestoreContext
): Promise<Result<BackupManifest, BackupStopReason>> {
  const backupDirPath = join(
    ctx.backupDriveMountPoint,
    BACKUP_ROOT_DIR,
    ctx.backupDirectoryName
  );
  const restoreInProgressPath = join(
    ctx.workspacePath,
    RESTORE_IN_PROGRESS_DIR
  );

  const backupStat = await ignoreMissing(stat(backupDirPath));
  assert(
    backupStat?.isDirectory(),
    `Backup directory not found: ${backupDirPath}`
  );

  // Clean up any previous restore-in-progress
  await cleanupDirSafe(restoreInProgressPath);

  let restoreResult: Result<BackupManifest, BackupStopReason>;
  try {
    restoreResult = await doRestore(ctx, backupDirPath, restoreInProgressPath);
  } catch (error) {
    restoreResult = err({ type: 'error', error: asError(error) });
  }

  if (restoreResult.isOk()) {
    return restoreResult;
  }

  debug('restore failed, attempting rollback: %o', restoreResult.err());

  const previousWorkspacePath = join(
    restoreInProgressPath,
    'previous-workspace'
  );

  try {
    await cleanupSafe(ctx.dbPath);
    await rename(
      join(previousWorkspacePath, WORKSPACE_DB_FILENAME),
      ctx.dbPath
    );
    debug('restored previous database');
  } catch {
    debug('rollback of database failed or no previous database to restore');
  }

  try {
    await cleanupDirSafe(ctx.ballotImagesPath);
    await rename(
      join(previousWorkspacePath, WORKSPACE_BALLOT_IMAGES_DIR),
      ctx.ballotImagesPath
    );
    debug('restored previous ballot images');
  } catch {
    debug('rollback of ballot images failed or no previous images to restore');
  }

  await cleanupDirSafe(restoreInProgressPath);
  return restoreResult;
}

async function doRestore(
  ctx: RestoreContext,
  backupDirPath: string,
  restoreInProgressPath: string
): Promise<Result<BackupManifest, BackupStopReason>> {
  // ── Pre-Flight ──────────────────────────────────────────────────────

  ctx.onProgress?.({
    phase: 'preflight',
    filesTotal: 0,
    filesCopied: 0,
  });

  // 1. Validate the backup (reads manifest, checks signature, verifies hashes)
  debug('validating backup at %s', backupDirPath);
  const validateResult = await validateBackup(
    backupDirPath,
    ctx.softwareVersion
  );

  if (validateResult.isErr()) {
    return validateResult;
  }

  if (ctx.signal?.aborted) {
    return err({ type: 'cancelled' });
  }

  const manifest = validateResult.ok();

  // 2. Check internal disk space
  const totalSize = manifest.files.reduce((sum, f) => sum + f.size, 0);
  const internalSpace = getAvailableDiskSpace(ctx.workspacePath);

  if (internalSpace > 0 && internalSpace < totalSize * 1.1) {
    return err({
      type: 'insufficientDiskSpace',
      location: 'internal',
      required: totalSize,
      available: internalSpace,
    });
  }

  // 3. Create restore directories
  await mkdir(restoreInProgressPath, { recursive: true });
  const previousWorkspacePath = join(
    restoreInProgressPath,
    'previous-workspace'
  );
  const newWorkspacePath = join(restoreInProgressPath, 'new-workspace');
  await mkdir(previousWorkspacePath, { recursive: true });
  await mkdir(newWorkspacePath, { recursive: true });
  await mkdir(join(newWorkspacePath, WORKSPACE_BALLOT_IMAGES_DIR), {
    recursive: true,
  });

  if (ctx.signal?.aborted) {
    return err({ type: 'cancelled' });
  }

  // ── Restore ─────────────────────────────────────────────────────────

  const totalFiles = manifest.files.length;
  let filesCopied = 0;

  ctx.onProgress?.({
    phase: 'copying',
    filesTotal: totalFiles,
    filesCopied: 0,
  });

  // 1. Copy all files from backup to new-workspace, verifying hashes
  for (const file of manifest.files) {
    if (ctx.signal?.aborted) {
      return err({ type: 'cancelled' });
    }

    const srcPath = join(backupDirPath, file.path);
    const destPath = join(newWorkspacePath, file.path);

    await mkdir(join(destPath, '..'), { recursive: true });
    const { sha256: hash } = await copyFileWithHash(srcPath, destPath);

    if (hash !== file.sha256) {
      return err({
        type: 'invalidFileHash',
        path: file.path,
        expected: file.sha256,
        actual: hash,
      });
    }

    filesCopied += 1;
    ctx.onProgress?.({
      phase: 'copying',
      filesTotal: totalFiles,
      filesCopied,
    });
  }

  if (ctx.signal?.aborted) {
    return err({ type: 'cancelled' });
  }

  // ── Activate ────────────────────────────────────────────────────────
  //
  // TODO: Make activation truly atomic by keeping both data.db and
  // ballot-images/ inside a versioned subdirectory (e.g.
  // workspace/data-v1/) and pointing a workspace/current symlink at it.
  // A restore would prepare workspace/data-v2/, then atomically swap
  // the symlink. This avoids the current two-step rename where the db
  // can succeed but images can fail, leaving the workspace inconsistent.
  // Requires changes to Workspace, Store, BackupManager, and a
  // migration strategy for existing deployments.

  ctx.onProgress?.({
    phase: 'activating',
    filesTotal: totalFiles,
    filesCopied: totalFiles,
  });

  // 2. Move current data to previous-workspace (may not exist on first restore)
  await ignoreMissing(
    rename(ctx.dbPath, join(previousWorkspacePath, WORKSPACE_DB_FILENAME))
  );
  await ignoreMissing(
    rename(
      ctx.ballotImagesPath,
      join(previousWorkspacePath, WORKSPACE_BALLOT_IMAGES_DIR)
    )
  );

  // 3. Move new data into workspace
  const newDbPath = join(newWorkspacePath, BACKUP_DB_FILENAME);
  const newImagesPath = join(newWorkspacePath, BACKUP_IMAGES_DIR);

  await rename(newDbPath, ctx.dbPath);
  const newImagesStat = await ignoreMissing(stat(newImagesPath));
  if (newImagesStat) {
    await rename(newImagesPath, ctx.ballotImagesPath);
  } else {
    // Ensure ballot-images directory exists even if backup had none
    await mkdir(ctx.ballotImagesPath, { recursive: true });
  }

  // 4. Clean up
  await cleanupDirSafe(restoreInProgressPath);

  debug('restore complete for election %s', manifest.electionTitle);
  return ok(manifest);
}
