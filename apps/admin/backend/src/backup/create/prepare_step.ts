import { Stats } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  assertDefined,
  err,
  extractErrorMessage,
  isNonExistentFileOrDirectoryError,
  iter,
  ok,
  Result,
} from '@votingworks/basics';
import { getDiskSpaceSummaries } from '@votingworks/backend';
import { exchangePaths } from '@votingworks/fs';
import { Id } from '@votingworks/types';
import { Store } from '../../store.js';
import { checkWorkspaceIsHostMode } from '../host_mode.js';
import { PrepareBackupOptions } from './types.js';
import { BackupStagingArea } from '../staging_area.js';

const DEFAULT_MIN_AVAILABLE_STORAGE_BYTES = 50_000_000; // 50 MB

async function statOrUndefined(path: string): Promise<Stats | undefined> {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}

/**
 * Possible expected errors that might occur during {@link prepare}.
 */
export type PrepareError =
  | {
      type: 'cancelled';
      message: string;
    }
  | {
      type: 'not-host-mode';
      message: string;
    }
  | {
      type: 'file-not-found';
      path: string;
      message: string;
    }
  | {
      type: 'not-directory';
      path: string;
      message: string;
    }
  | {
      type: 'target-cannot-swap';
      path: string;
      message: string;
    }
  | {
      type: 'unconfigured';
      message: string;
    }
  | {
      type: 'backup-in-progress';
      message: string;
    }
  | {
      type: 'write-in-progress';
      message: string;
    }
  | {
      type: 'insufficient-workspace-storage';
      available: number;
      required: number;
      message: string;
    }
  | {
      type: 'insufficient-target-storage';
      available: number;
      required: number;
      message: string;
    };

/**
 * Reported when the caller cancelled the backup.
 */
const CANCELLED_ERROR: PrepareError = {
  type: 'cancelled',
  message: 'Backup cancelled',
};

/**
 * Reported when the database cannot be snapshotted because something else is
 * partway through writing to it.
 */
const WRITE_IN_PROGRESS_ERROR: PrepareError = {
  type: 'write-in-progress',
  message: 'Cannot back up while another operation is writing to the database',
};

/**
 * A backup staged on the local disk and ready to be copied, minus the manifest.
 */
export interface PreparedBackup {
  /**
   * The database ID of the election to be backed up.
   */
  electionId: Id;

  /**
   * Manages the location on disk where the database snapshot and other files to
   * be copied were staged.
   */
  source: BackupStagingArea;

  /**
   * A store for the staged database snapshot, not the original workspace store.
   */
  snapshotStore: Store;
}

/**
 * Prefix for the throwaway directory {@link checkTargetCanSwap} works in. Its
 * leading dot keeps it out of the way of anything listing the drive, and
 * `mkdtemp` completes it with enough randomness that two runs never collide.
 */
const SWAP_CHECK_PREFIX = '.vx-swap-check-';

/**
 * Checks that the target can have a finished backup swapped into place, which
 * is how the last backup is replaced without either one ever being missing.
 * `renameat2(2)` with `RENAME_EXCHANGE` is not supported on every filesystem —
 * FAT32 refuses it — and only a target that already holds a backup would
 * exercise it, so the first backup to a drive would succeed and every one
 * after it would fail. Two throwaway directories answer the question outright,
 * rather than a copy of the whole database finding out at the end.
 */
async function checkTargetCanSwap(
  target: string
): Promise<Result<void, PrepareError>> {
  // A directory of its own, so that whatever a killed run left behind is never
  // mistaken for a target that cannot hold backups. `target` has just been
  // confirmed to be a directory, so the two inside it need no parents created.
  let checkPath: string | undefined;

  try {
    checkPath = await mkdtemp(join(target, SWAP_CHECK_PREFIX));
    const a = join(checkPath, 'a');
    const b = join(checkPath, 'b');
    await mkdir(a);
    await mkdir(b);

    const exchangeResult = exchangePaths(a, b);
    if (exchangeResult.isErr()) {
      return err({
        type: 'target-cannot-swap',
        path: target,
        message: `${target} cannot hold backups: ${
          exchangeResult.err().message
        }`,
      });
    }

    return ok();
  } catch (error) {
    // A target that cannot even be written to is one no backup can be swapped
    // into, so it fails here rather than after the copy.
    return err({
      type: 'target-cannot-swap',
      path: target,
      message: `${target} cannot hold backups: ${extractErrorMessage(error)}`,
    });
  } finally {
    if (checkPath) {
      await rm(checkPath, { recursive: true, force: true });
    }
  }
}

/**
 * Prepares the backup creation to take place by ensuring the source workspace
 * and target locations are known and able to fit the data to be copied. Stages
 * the data to be copied, including a database snapshot, returning a reference
 * to the staging area.
 */
export async function prepare(
  options: PrepareBackupOptions
): Promise<Result<PreparedBackup, PrepareError>> {
  const { logger, onProgressEvent, signal, target, workspace } = options;
  const minAvailableStorageBytes =
    options.minAvailableStorageBytes ?? DEFAULT_MIN_AVAILABLE_STORAGE_BYTES;
  onProgressEvent?.({ type: 'preparing' });

  if (signal?.aborted) {
    return err(CANCELLED_ERROR);
  }

  const hostModeResult = checkWorkspaceIsHostMode(workspace);
  if (hostModeResult.isErr()) {
    return hostModeResult;
  }

  // Check the target up front: an unmounted backup drive is the likeliest
  // reason for a backup to fail, and snapshotting the database before noticing
  // would waste a full copy of it.
  const targetStat = await statOrUndefined(target);

  if (!targetStat) {
    return err({
      type: 'file-not-found',
      path: target,
      message: 'Backup target directory could not be found',
    });
  }

  if (!targetStat.isDirectory()) {
    return err({
      type: 'not-directory',
      path: target,
      message: `${target} is not a directory`,
    });
  }

  const swapResult = await checkTargetCanSwap(target);
  if (swapResult.isErr()) {
    return swapResult;
  }

  // Claim the staging area first. It reclaims what a killed run left behind,
  // so the free space measured below doesn't count a dead run's snapshot
  // against this one, and it holds the lock that makes reclaiming safe.
  const stagingAreaResult = await BackupStagingArea.inWorkspace(workspace.path);
  if (stagingAreaResult.isErr()) {
    return err({
      type: 'backup-in-progress',
      message: stagingAreaResult.err().message,
    });
  }
  const stagingArea = stagingAreaResult.ok();
  // The workspace's own connection, so that writes made through it update the
  // snapshot in place instead of restarting it.
  const dbClient = workspace.store['client'];
  let snapshotStore: Store | undefined;
  let shouldPurgeStagingArea = true;

  try {
    const [workspaceDiskSpace] = await getDiskSpaceSummaries([workspace.path]);
    const workspaceDiskAvailableBytes = workspaceDiskSpace.available * 1024;

    //
    // Ensure the local workspace directory has enough space to store a full
    // copy of the database since we need a stable snapshot to serve as the
    // basis of the backup.
    //

    const currentElectionId = workspace.store.getCurrentElectionId();
    if (!currentElectionId) {
      return err({
        type: 'unconfigured',
        message: 'An unconfigured VxAdmin cannot be backed up',
      });
    }

    const dbStat = await stat(workspace.store.getDbPath());

    if (workspaceDiskAvailableBytes - dbStat.size < minAvailableStorageBytes) {
      return err({
        type: 'insufficient-workspace-storage',
        available: workspaceDiskAvailableBytes,
        required: minAvailableStorageBytes + dbStat.size,
        message: 'Not enough free space to snapshot the database',
      });
    }

    //
    // Prepare the staging area with a database snapshot and cheap clones of
    // all the files to copy over to the backup target location.
    //
    const dbSnapshotPath = await stagingArea.prepareStagingPath(
      workspace.store.getDbPath()
    );

    const snapshotResult = await dbClient.backup(dbSnapshotPath, {
      signal,
      onProgress: (progress) =>
        onProgressEvent?.({ type: 'db_snapshot', progress }),
    });
    if (snapshotResult.isErr()) {
      return err(
        snapshotResult.err().type === 'cancelled'
          ? CANCELLED_ERROR
          : WRITE_IN_PROGRESS_ERROR
      );
    }

    await stagingArea.markStagingPathReady(dbSnapshotPath);

    // Enumerate ballot images from the snapshot we just took, not the live
    // store. If a concurrent action (e.g. deleting a CVR file) removes any
    // referenced files we want the backup to fail at this stage rather than
    // later. Once we've got everything staged we should be be free of
    // application-level data races and left with only filesystem-level data
    // races.
    snapshotStore = Store.fileStore(
      dbSnapshotPath,
      workspace.store.getBallotImagesPath(),
      workspace.store.getElectionPackagesPath(),
      logger
    );

    const electionPackageSourcePath = assertDefined(
      snapshotStore.getElectionPackageFilePath(currentElectionId)
    );
    await stagingArea.linkWorkspaceFile(electionPackageSourcePath);

    const snapshotBallotImagePaths =
      snapshotStore.getAllBallotImagePaths(currentElectionId);
    let linkedCount = 0;
    await Promise.all(
      snapshotBallotImagePaths.map(async (ballotImagePath) => {
        await stagingArea.linkWorkspaceFile(ballotImagePath);
        linkedCount += 1;
        onProgressEvent?.({
          type: 'staging_files',
          progress: linkedCount / snapshotBallotImagePaths.length,
        });
      })
    );

    // Linking is cheap enough that the images already started are left to
    // finish; this only keeps the expensive target measurement below from
    // running for a backup nobody is waiting for.
    if (signal?.aborted) {
      return err(CANCELLED_ERROR);
    }

    const backupSizeBytes = await iter(stagingArea.listStagedFiles())
      .async()
      .map(({ size }) => size)
      .sum();
    let targetDiskAvailableBytes: number;
    try {
      const [targetDiskSpace] = await getDiskSpaceSummaries([target]);
      targetDiskAvailableBytes = targetDiskSpace.available * 1024;
    } catch (error) {
      // `df` exits non-zero when its path is gone and rejects with that exit
      // code rather than an ENOENT, so ask the filesystem directly to tell a
      // drive removed mid-backup from a genuine failure.
      if (await statOrUndefined(target)) {
        throw error;
      }

      return err({
        type: 'file-not-found',
        path: target,
        message: 'Backup target directory could not be found',
      });
    }

    if (targetDiskAvailableBytes - backupSizeBytes < minAvailableStorageBytes) {
      return err({
        type: 'insufficient-target-storage',
        available: targetDiskAvailableBytes,
        required: minAvailableStorageBytes + backupSizeBytes,
        message: 'Not enough free space on the backup target',
      });
    }

    shouldPurgeStagingArea = false;
    return ok({
      electionId: currentElectionId,
      source: stagingArea,
      snapshotStore,
    });
  } catch (error) {
    if (isNonExistentFileOrDirectoryError(error)) {
      return err({
        type: 'file-not-found',
        path: assertDefined((error as NodeJS.ErrnoException).path),
        message: extractErrorMessage(error),
      });
    }

    throw error;
  } finally {
    if (shouldPurgeStagingArea) {
      // Close the snapshot's connection before deleting the file it holds
      // open, or the space it occupies won't be reclaimed until we exit.
      snapshotStore?.close();
      await stagingArea.cleanup();
    }
  }
}
