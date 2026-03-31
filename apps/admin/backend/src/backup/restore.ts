import {
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import makeDebug from 'debug';
import { assert } from '@votingworks/basics';
import { BaseLogger } from '@votingworks/logging';

import {
  BACKUP_DB_FILENAME,
  BACKUP_IMAGES_DIR,
  BACKUP_ROOT_DIR,
  BackupManifest,
  MANIFEST_FILENAME,
  RESTORE_IN_PROGRESS_DIR,
  RestoreProgress,
} from './types';
import {
  cleanupDirSafe,
  cleanupSafe,
  formatBytes,
  getAvailableDiskSpace,
  ignoreMissing,
} from './fs_utils';
import { validateBackup } from './backup';
import { sha256File } from '../util/sha256_file';

const debug = makeDebug('admin:restore');

/** Context needed to perform a restore operation. */
export interface RestoreContext {
  readonly workspacePath: string;
  readonly dbPath: string;
  readonly ballotImagesPath: string;
  readonly backupDriveMountPoint: string;
  readonly backupDirectoryName: string;
  readonly softwareVersion: string;
  readonly logger: BaseLogger;
  onProgress?: (progress: RestoreProgress) => void;
  signal?: AbortSignal;
}

class RestoreCancelledError extends Error {
  constructor() {
    super('Restore was cancelled');
    this.name = 'RestoreCancelledError';
  }
}

function checkCancel(ctx: RestoreContext): void {
  if (ctx.signal?.aborted) {
    throw new RestoreCancelledError();
  }
}

/**
 * Restore workspace data from a backup on a USB drive.
 *
 * Designed to be safe and atomic — if anything fails, the previous
 * workspace data is restored.
 */
export async function performRestore(
  ctx: RestoreContext
): Promise<BackupManifest> {
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

  try {
    return await doRestore(ctx, backupDirPath, restoreInProgressPath);
  } catch (error) {
    debug('restore failed, attempting rollback: %s', error);

    const previousWorkspacePath = join(
      restoreInProgressPath,
      'previous-workspace'
    );

    try {
      await cleanupSafe(ctx.dbPath);
      await rename(join(previousWorkspacePath, 'data.db'), ctx.dbPath);
      debug('restored previous database');
    } catch {
      debug('rollback of database failed or no previous database to restore');
    }

    try {
      await cleanupDirSafe(ctx.ballotImagesPath);
      await rename(
        join(previousWorkspacePath, 'ballot-images'),
        ctx.ballotImagesPath
      );
      debug('restored previous ballot images');
    } catch {
      debug(
        'rollback of ballot images failed or no previous images to restore'
      );
    }

    await cleanupDirSafe(restoreInProgressPath);
    throw error;
  }
}

async function doRestore(
  ctx: RestoreContext,
  backupDirPath: string,
  restoreInProgressPath: string
): Promise<BackupManifest> {
  // ── Pre-Flight ──────────────────────────────────────────────────────

  ctx.onProgress?.({
    phase: 'preflight',
    filesTotal: 0,
    filesCopied: 0,
  });

  // 1. Validate the backup (reads manifest, checks signature, verifies hashes)
  debug('validating backup at %s', backupDirPath);
  const manifest = await validateBackup(backupDirPath, ctx.softwareVersion);

  checkCancel(ctx);

  // 2. Check internal disk space
  const totalSize = manifest.files.reduce((sum, f) => sum + f.size, 0);
  const internalSpace = getAvailableDiskSpace(ctx.workspacePath);

  if (internalSpace > 0 && internalSpace < totalSize * 1.1) {
    throw new Error(
      `Internal drive has insufficient space for restore. ` +
        `Need ~${formatBytes(totalSize)}, available: ${formatBytes(
          internalSpace
        )}.`
    );
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
  await mkdir(join(newWorkspacePath, 'ballot-images'), { recursive: true });

  // 4. Write manifest for reference
  const manifestJson = await readFile(
    join(backupDirPath, MANIFEST_FILENAME),
    'utf-8'
  );
  await writeFile(
    join(restoreInProgressPath, MANIFEST_FILENAME),
    manifestJson,
    'utf-8'
  );

  checkCancel(ctx);

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
    checkCancel(ctx);

    const srcPath = join(backupDirPath, file.path);
    const destPath = join(newWorkspacePath, file.path);

    await mkdir(join(destPath, '..'), { recursive: true });
    await copyFile(srcPath, destPath);

    // Verify hash after copy
    const hash = await sha256File(destPath);
    if (hash !== file.sha256) {
      throw new Error(
        `Hash mismatch during restore for ${file.path}: ` +
          `expected ${file.sha256}, got ${hash}`
      );
    }

    filesCopied += 1;
    ctx.onProgress?.({
      phase: 'copying',
      filesTotal: totalFiles,
      filesCopied,
    });
  }

  checkCancel(ctx);

  // ── Activate ────────────────────────────────────────────────────────

  ctx.onProgress?.({
    phase: 'activating',
    filesTotal: totalFiles,
    filesCopied: totalFiles,
  });

  // 2. Move current data to previous-workspace (may not exist on first restore)
  await ignoreMissing(
    rename(ctx.dbPath, join(previousWorkspacePath, 'data.db'))
  );
  await ignoreMissing(
    rename(ctx.ballotImagesPath, join(previousWorkspacePath, 'ballot-images'))
  );

  // 3. Move new data into workspace
  const newDbPath = join(newWorkspacePath, BACKUP_DB_FILENAME);
  const newImagesPath = join(newWorkspacePath, BACKUP_IMAGES_DIR);

  await rename(newDbPath, ctx.dbPath);
  if (!(await ignoreMissing(rename(newImagesPath, ctx.ballotImagesPath)))) {
    // Ensure ballot-images directory exists even if backup had none
    await mkdir(ctx.ballotImagesPath, { recursive: true });
  }

  // 4. Clean up
  await cleanupDirSafe(restoreInProgressPath);

  debug('restore complete for election %s', manifest.electionTitle);
  return manifest;
}
