import { err, ok, Result } from '@votingworks/basics';
import { syncFilesystem } from '@votingworks/fs';
import { BaseLogger } from '@votingworks/logging';
import { createWorkspace } from '../../util/workspace.js';
import { BackupManifest } from '../backup_manifest.js';
import { RestoreError } from './types.js';

/**
 * Verifies that the restored workspace holds what the manifest promised: a
 * database configured with the election the operator was told they were
 * restoring.
 */
export function verifyRestoredWorkspace({
  manifest,
  workspacePath,
  logger,
}: {
  manifest: BackupManifest;
  workspacePath: string;
  logger: BaseLogger;
}): Result<void, RestoreError> {
  // A manifest lists only files, so a backup carries no record of workspace
  // directories that were empty (e.g. `ballot-images` before any CVRs are
  // loaded). `createWorkspace` recreates whatever the copy didn't, rather than
  // requiring the backup to have provided it. This runs before the flush, so
  // the recreated directories are covered by it.
  using workspace = createWorkspace(workspacePath, logger);
  const currentElectionId = workspace.store.getCurrentElectionId();
  const electionDefinitionId =
    currentElectionId &&
    workspace.store.getElectionDefinitionId(currentElectionId);

  if (electionDefinitionId !== manifest.election.id) {
    return err({
      type: 'backup-verification-failed',
      message: `Expected election ID ${manifest.election.id} but got ${
        electionDefinitionId || 'none'
      }`,
    });
  }

  return ok();
}

/**
 * Flushes the restored files to disk, so that declaring the restore complete
 * means the data survives an immediate power cut. Without this the restored
 * files may live only in the page cache.
 */
export async function flushRestoredWorkspace(
  workspacePath: string
): Promise<Result<void, RestoreError>> {
  const flushResult = await syncFilesystem(workspacePath);
  if (flushResult.isErr()) {
    return err({
      type: 'workspace-flush-failed',
      message: `Failed to flush the restored workspace to disk: ${
        flushResult.err().message
      }`,
    });
  }

  return ok();
}
