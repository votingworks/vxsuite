import { mkdir, rm, writeFile } from 'node:fs/promises';
import { err, iter, ok, Result } from '@votingworks/basics';
import { getDiskSpaceSummaries } from '@votingworks/backend';
import { Logger, LogEventId } from '@votingworks/logging';
import {
  emptyWorkspaceData,
  getRestoreInProgressMarkerPath,
  getWorkspaceControlPath,
  hasInterruptedRestore,
  Workspace,
} from '../../util/workspace.js';
import { BackupManifest } from '../backup_manifest.js';
import { checkWorkspaceIsHostMode } from '../host_mode.js';
import { RestoreError } from './types.js';

const DEFAULT_MIN_AVAILABLE_STORAGE_BYTES = 50_000_000; // 50 MB

/**
 * Checks that the workspace is one a restore may take over: a host machine's,
 * not being written to, and either unconfigured or left behind by an
 * interrupted restore (per the marker), in which case the restore is what
 * recovers it.
 */
export async function checkWorkspaceIsRestorable(
  workspace: Workspace,
  logger: Logger
): Promise<Result<void, RestoreError>> {
  const hostModeResult = checkWorkspaceIsHostMode(workspace);
  if (hostModeResult.isErr()) {
    return hostModeResult;
  }

  // The restore closes this connection and deletes the database under it, so
  // an operation partway through writing would be cut off mid-transaction with
  // no way to tell whether its work survived. Checked before the marker, since
  // a workspace left by an interrupted restore is no reason to cut off a write
  // that is happening right now.
  if (workspace.store.isInTransaction()) {
    return err({
      type: 'write-in-progress',
      message:
        'Cannot restore while another operation is writing to the database',
    });
  }

  if (hasInterruptedRestore(workspace.path)) {
    await logger.logAsCurrentRole(LogEventId.BackupRestoreInterrupted, {
      message:
        'Restoring over a workspace an earlier restore left unfinished; ' +
        'whatever it holds now is being replaced.',
    });
    return ok();
  }

  const currentElectionId = workspace.store.getCurrentElectionId();
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
