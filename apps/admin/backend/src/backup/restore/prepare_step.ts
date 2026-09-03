import { mkdir, rm, writeFile } from 'node:fs/promises';
import { err, iter, ok, Result } from '@votingworks/basics';
import { getDiskSpaceSummaries } from '@votingworks/backend';
import { Logger, LogEventId } from '@votingworks/logging';
import {
  emptyWorkspaceData,
  getRestoreInProgressMarkerPath,
  getWorkspaceControlPath,
  hasInterruptedRestore,
  openWorkspaceStoreIfPresent,
} from '../../util/workspace.js';
import { BackupManifest } from '../backup_manifest.js';
import { checkWorkspaceIsHostMode } from '../host_mode.js';
import { RestoreError } from './types.js';

const DEFAULT_MIN_AVAILABLE_STORAGE_BYTES = 50_000_000; // 50 MB

/**
 * Checks that the workspace is one a restore may take over: a host machine's,
 * and either unconfigured or left behind by an interrupted restore (per the
 * marker), in which case the restore is what recovers it. A workspace with no
 * database yet is unconfigured; one with a database is asked, and left as it
 * was.
 */
export async function checkWorkspaceIsRestorable(
  workspacePath: string,
  logger: Logger
): Promise<Result<void, RestoreError>> {
  const hostModeResult = checkWorkspaceIsHostMode(workspacePath);
  if (hostModeResult.isErr()) {
    return hostModeResult;
  }

  if (hasInterruptedRestore(workspacePath)) {
    await logger.logAsCurrentRole(LogEventId.BackupRestoreInterrupted, {
      message:
        'Restoring over a workspace an earlier restore left unfinished; ' +
        'whatever it holds now is being replaced.',
    });
    return ok();
  }

  using store = openWorkspaceStoreIfPresent(workspacePath, logger);
  const currentElectionId = store?.getCurrentElectionId();
  if (currentElectionId) {
    return err({
      type: 'workspace-already-configured',
      message: `Expected workspace to be unconfigured, but it has election with ID ${currentElectionId}`,
    });
  }

  return ok();
}

/**
 * Checks that the workspace's volume can hold what the manifest promises to
 * deliver, with `minAvailableStorageBytes` to spare. Refusing up front beats
 * discovering a full disk partway through copying the database.
 */
export async function checkWorkspaceHasSufficientSpace({
  workspacePath,
  manifest,
  minAvailableStorageBytes = DEFAULT_MIN_AVAILABLE_STORAGE_BYTES,
}: {
  workspacePath: string;
  manifest: BackupManifest;
  minAvailableStorageBytes?: number;
}): Promise<Result<void, RestoreError>> {
  const [workspaceDiskSpace] = await getDiskSpaceSummaries([workspacePath]);
  const available = workspaceDiskSpace.available * 1024;
  const required = iter(manifest.files).sum((file) => file.size);

  if (available - required < minAvailableStorageBytes) {
    return err({
      type: 'insufficient-workspace-storage',
      available,
      required,
      message: `Restoring this backup requires ${required} bytes plus ${minAvailableStorageBytes} bytes to spare, but only ${available} bytes are available`,
    });
  }

  return ok();
}

/**
 * Takes ownership of the workspace: empties its data so the restore starts from
 * a clean slate, and drops the in-progress marker.
 */
export async function claimWorkspace(workspacePath: string): Promise<void> {
  await emptyWorkspaceData(workspacePath);
  await mkdir(getWorkspaceControlPath(workspacePath), { recursive: true });
  await writeFile(getRestoreInProgressMarkerPath(workspacePath), '');
}

/**
 * Clears out a failed restore's partial work, so that nothing half-restored is
 * left to be mistaken for data.
 */
export async function abandonFailedRestore(
  workspacePath: string
): Promise<void> {
  await emptyWorkspaceData(workspacePath);
}

/**
 * Removes the in-progress marker, declaring the restore complete.
 */
export async function completeRestore(workspacePath: string): Promise<void> {
  await rm(getRestoreInProgressMarkerPath(workspacePath), { force: true });
}
