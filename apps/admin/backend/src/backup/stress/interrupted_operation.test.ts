import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { makeTemporaryDirectory } from '@votingworks/fixtures';
import { mockBaseLogger } from '@votingworks/logging';
import { assertDefined, err } from '@votingworks/basics';

import {
  WORKSPACE_BALLOT_IMAGES_DIR,
  WORKSPACE_DB_FILENAME,
} from '../../util/workspace';
import { performBackup, listBackups, validateBackup } from '../backup';
import { performRestore, RestoreContext } from '../restore';
import {
  BACKUP_ROOT_DIR,
  BackupProgress,
  IN_PROGRESS_SUFFIX,
  PREVIOUS_SUFFIX,
  RESTORE_IN_PROGRESS_DIR,
} from '../types';
import {
  backupAndValidate,
  createBackupContext,
  createPopulatedWorkspace,
} from './workspace_factory';

/**
 * Returns directory entries under the backup root that end with the given
 * suffix, or all entries if no suffix is provided.
 */
async function backupRootEntries(
  mountPoint: string,
  suffix?: string
): Promise<string[]> {
  const rootPath = join(mountPoint, BACKUP_ROOT_DIR);
  let entries: string[];
  try {
    entries = await readdir(rootPath);
  } catch {
    return [];
  }
  if (suffix) {
    return entries.filter((e) => e.endsWith(suffix));
  }
  return entries;
}

describe('interrupted operations', () => {
  test('cancellation during preflight cleans up', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 3,
      imagesPerCvr: 1,
    });
    const mountPoint = makeTemporaryDirectory();

    const controller = new AbortController();
    const ctx = createBackupContext(workspace, mountPoint, {
      signal: controller.signal,
      onProgress(progress: BackupProgress) {
        if (progress.phase === 'preflight') {
          controller.abort();
        }
      },
    });

    const result = await performBackup(ctx);

    expect(result).toEqual(err({ type: 'cancelled' }));

    const inProgressDirs = await backupRootEntries(
      mountPoint,
      IN_PROGRESS_SUFFIX
    );
    expect(inProgressDirs).toHaveLength(0);

    const allEntries = await backupRootEntries(mountPoint);
    expect(allEntries).toHaveLength(0);
  });

  test('cancellation during snapshot cleans up', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 3,
      imagesPerCvr: 1,
    });
    const mountPoint = makeTemporaryDirectory();

    const controller = new AbortController();
    const ctx = createBackupContext(workspace, mountPoint, {
      signal: controller.signal,
      onProgress(progress: BackupProgress) {
        if (progress.phase === 'snapshot') {
          controller.abort();
        }
      },
    });

    const result = await performBackup(ctx);

    expect(result).toEqual(err({ type: 'cancelled' }));

    const inProgressDirs = await backupRootEntries(
      mountPoint,
      IN_PROGRESS_SUFFIX
    );
    expect(inProgressDirs).toHaveLength(0);

    const allEntries = await backupRootEntries(mountPoint);
    expect(allEntries).toHaveLength(0);
  });

  test('cancellation during images phase cleans up', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 20,
      imagesPerCvr: 1,
    });
    expect(workspace.totalImages).toEqual(20);
    const mountPoint = makeTemporaryDirectory();

    const controller = new AbortController();
    const ctx = createBackupContext(workspace, mountPoint, {
      signal: controller.signal,
      onProgress(progress: BackupProgress) {
        if (progress.phase === 'images' && progress.imagesCopied >= 3) {
          controller.abort();
        }
      },
    });

    const result = await performBackup(ctx);

    expect(result).toEqual(err({ type: 'cancelled' }));

    const inProgressDirs = await backupRootEntries(
      mountPoint,
      IN_PROGRESS_SUFFIX
    );
    expect(inProgressDirs).toHaveLength(0);
  });

  test('cancellation during signing cleans up', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 3,
      imagesPerCvr: 1,
    });
    const mountPoint = makeTemporaryDirectory();

    const controller = new AbortController();
    const ctx = createBackupContext(workspace, mountPoint, {
      signal: controller.signal,
      onProgress(progress: BackupProgress) {
        if (progress.phase === 'signing') {
          controller.abort();
        }
      },
    });

    const result = await performBackup(ctx);

    expect(result).toEqual(err({ type: 'cancelled' }));

    const inProgressDirs = await backupRootEntries(
      mountPoint,
      IN_PROGRESS_SUFFIX
    );
    expect(inProgressDirs).toHaveLength(0);
  });

  test('backup completes even if aborted during validation', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 3,
      imagesPerCvr: 1,
    });
    const mountPoint = makeTemporaryDirectory();

    const controller = new AbortController();
    const ctx = createBackupContext(workspace, mountPoint, {
      signal: controller.signal,
      onProgress(progress: BackupProgress) {
        if (progress.phase === 'validating') {
          controller.abort();
        }
      },
    });

    const result = await performBackup(ctx);

    // The 'validating' progress is emitted after the directory swap, so the
    // backup data is already in its final location. validateBackup() has no
    // signal checks, so the backup may complete successfully. Accept either
    // outcome.
    if (result.isOk()) {
      const entries = await listBackups(mountPoint);
      expect(entries).toHaveLength(1);
      const backupDir = join(
        mountPoint,
        BACKUP_ROOT_DIR,
        assertDefined(entries[0]).directoryName
      );
      (await validateBackup(backupDir)).unsafeUnwrap();
    } else {
      expect(result.err()).toEqual({ type: 'cancelled' });
    }
  });

  test('new backup succeeds after interrupted backup left in-progress dir', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 10,
      imagesPerCvr: 1,
    });
    const mountPoint = makeTemporaryDirectory();

    // First backup: abort during images phase to leave partial state
    const controller = new AbortController();
    const ctx = createBackupContext(workspace, mountPoint, {
      signal: controller.signal,
      onProgress(progress: BackupProgress) {
        if (progress.phase === 'images' && progress.imagesCopied >= 3) {
          controller.abort();
        }
      },
    });

    const firstResult = await performBackup(ctx);
    expect(firstResult).toEqual(err({ type: 'cancelled' }));

    // Run a second backup to completion
    const ctx2 = createBackupContext(workspace, mountPoint);
    const secondResult = await performBackup(ctx2);

    secondResult.unsafeUnwrap();

    const entries = await listBackups(mountPoint);
    expect(entries).toHaveLength(1);

    const backupDir = join(
      mountPoint,
      BACKUP_ROOT_DIR,
      assertDefined(entries[0]).directoryName
    );
    const manifest = (await validateBackup(backupDir)).unsafeUnwrap();
    expect(manifest.files.length).toBeGreaterThan(1);

    // No stale in-progress directories should remain
    const inProgressDirs = await backupRootEntries(
      mountPoint,
      IN_PROGRESS_SUFFIX
    );
    expect(inProgressDirs).toHaveLength(0);
  });

  test('new backup succeeds when stale -previous directory exists', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 3,
      imagesPerCvr: 1,
    });
    const mountPoint = makeTemporaryDirectory();

    // Create a first successful backup
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);

    // Manually create a stale -previous directory alongside the backup
    const previousDirPath = join(
      mountPoint,
      BACKUP_ROOT_DIR,
      `${backupDirName}${PREVIOUS_SUFFIX}`
    );
    await mkdir(previousDirPath, { recursive: true });

    // Run another backup
    const ctx = createBackupContext(workspace, mountPoint);
    const result = await performBackup(ctx);

    result.unsafeUnwrap();

    // -previous directory should be cleaned up
    const previousDirs = await backupRootEntries(mountPoint, PREVIOUS_SUFFIX);
    expect(previousDirs).toHaveLength(0);

    // Backup should be valid
    const entries = await listBackups(mountPoint);
    expect(entries).toHaveLength(1);
    const backupDir = join(
      mountPoint,
      BACKUP_ROOT_DIR,
      assertDefined(entries[0]).directoryName
    );
    (await validateBackup(backupDir)).unsafeUnwrap();
  });

  test('restore cancellation during copy rolls back', async () => {
    const workspace = createPopulatedWorkspace({
      batchCount: 1,
      cvrsPerBatch: 10,
      imagesPerCvr: 1,
    });
    const mountPoint = makeTemporaryDirectory();

    // Create a valid backup
    const { backupDirName } = await backupAndValidate(workspace, mountPoint);

    // Set up a target workspace with an existing data.db
    const targetWorkspacePath = makeTemporaryDirectory();
    const targetDbPath = join(targetWorkspacePath, WORKSPACE_DB_FILENAME);
    const targetBallotImagesPath = join(
      targetWorkspacePath,
      WORKSPACE_BALLOT_IMAGES_DIR
    );

    // Copy the source db to the target so there is an existing database
    workspace.backupDatabase(targetDbPath);
    await mkdir(targetBallotImagesPath, { recursive: true });

    const logger = mockBaseLogger({ fn: vi.fn });
    const controller = new AbortController();

    const restoreCtx: RestoreContext = {
      workspacePath: targetWorkspacePath,
      dbPath: targetDbPath,
      ballotImagesPath: targetBallotImagesPath,
      backupDriveMountPoint: mountPoint,
      backupDirectoryName: backupDirName,
      softwareVersion: 'dev',
      logger,
      signal: controller.signal,
      onProgress(progress) {
        if (progress.phase === 'copying' && progress.filesCopied >= 1) {
          controller.abort();
        }
      },
    };

    const result = await performRestore(restoreCtx);

    expect(result).toEqual(err({ type: 'cancelled' }));

    // The restore-in-progress directory should be cleaned up
    let restoreInProgressExists = true;
    try {
      await readdir(join(targetWorkspacePath, RESTORE_IN_PROGRESS_DIR));
    } catch {
      restoreInProgressExists = false;
    }
    expect(restoreInProgressExists).toEqual(false);
  });
});
