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
import { Stats } from 'node:fs';
import { stat } from 'node:fs/promises';
import { openWorkspace } from '../../util/workspace.js';
import { Store } from '../../store.js';
import { PrepareBackupOptions } from './types.js';
import { BackupStagingArea } from '../staging_area.js';
import { ElectionRecord } from '../../types.js';

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
      type: 'unconfigured';
      message: string;
    }
  | {
      type: 'backup-in-progress';
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
 * Prepares the backup creation to take place by ensuring the source workspace
 * and target locations are known and able to fit the data to be copied. Stages
 * the data to be copied, including a database snapshot, returning a reference
 * to the staging area.
 */
export async function prepare(
  options: PrepareBackupOptions
): Promise<
  Result<
    { source: BackupStagingArea; store: Store; electionRecord: ElectionRecord },
    PrepareError
  >
> {
  const minAvailableStorageBytes =
    options.minAvailableStorageBytes ?? DEFAULT_MIN_AVAILABLE_STORAGE_BYTES;
  options.onProgressEvent?.({ type: 'preparing' });

  if (!(await statOrUndefined(options.workspace))) {
    return err({
      type: 'file-not-found',
      path: options.workspace,
      message: 'Workspace directory could not be found',
    });
  }

  // Check the target up front: an unmounted backup drive is the likeliest
  // reason for a backup to fail, and snapshotting the database before noticing
  // would waste a full copy of it.
  const targetStat = await statOrUndefined(options.target);

  if (!targetStat) {
    return err({
      type: 'file-not-found',
      path: options.target,
      message: 'Backup target directory could not be found',
    });
  }

  if (!targetStat.isDirectory()) {
    return err({
      type: 'not-directory',
      path: options.target,
      message: `${options.target} is not a directory`,
    });
  }

  // Claim the staging area first. It reclaims what a killed run left behind,
  // so the free space measured below doesn't count a dead run's snapshot
  // against this one, and it holds the lock that makes reclaiming safe.
  const stagingAreaResult = await BackupStagingArea.inWorkspace(
    options.workspace
  );
  if (stagingAreaResult.isErr()) {
    return err({
      type: 'backup-in-progress',
      message: stagingAreaResult.err().message,
    });
  }
  const stagingArea = stagingAreaResult.ok();
  let snapshotStore: Store | undefined;
  let shouldPurgeStagingArea = true;

  try {
    const [workspaceDiskSpace] = await getDiskSpaceSummaries([
      options.workspace,
    ]);
    const workspaceDiskAvailableBytes = workspaceDiskSpace.available * 1024;

    //
    // Ensure the local workspace directory has enough space to store a full
    // copy of the database since we need a stable snapshot to serve as the
    // basis of the backup.
    //

    using workspace = openWorkspace(options.workspace, options.logger);
    const currentElectionId = workspace.store.getCurrentElectionId();
    const currentElectionRecord =
      currentElectionId && workspace.store.getElection(currentElectionId);

    if (!currentElectionRecord) {
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
    await workspace.store['client'].backup(dbSnapshotPath, {
      progress(info) {
        options.onProgressEvent?.({
          type: 'db_snapshot',
          progress: (info.totalPages - info.remainingPages) / info.totalPages,
        });
        // NOTE: `better-sqlite3`'s types say the return type has to be a number,
        // but that's only if we want to control the next chunk of the backup's
        // page size. Returning `undefined` lets the caller pick.
        return undefined as unknown as number;
      },
    });
    options.onProgressEvent?.({ type: 'db_snapshot', progress: 1 });
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
      options.logger
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
        options.onProgressEvent?.({
          type: 'staging_files',
          progress: linkedCount / snapshotBallotImagePaths.length,
        });
      })
    );

    const backupSizeBytes = await iter(stagingArea.listStagedFiles())
      .async()
      .map(({ size }) => size)
      .sum();
    let targetDiskAvailableBytes: number;
    try {
      const [targetDiskSpace] = await getDiskSpaceSummaries([options.target]);
      targetDiskAvailableBytes = targetDiskSpace.available * 1024;
    } catch (error) {
      // `df` exits non-zero when its path is gone and rejects with that exit
      // code rather than an ENOENT, so ask the filesystem directly to tell a
      // drive removed mid-backup from a genuine failure.
      if (await statOrUndefined(options.target)) {
        throw error;
      }

      return err({
        type: 'file-not-found',
        path: options.target,
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
      source: stagingArea,
      store: snapshotStore,
      electionRecord: currentElectionRecord,
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
