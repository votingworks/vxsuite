import { err, ok, Result, throwIllegalValue } from '@votingworks/basics';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import { LATEST_SOFTWARE_VERSION } from '@votingworks/types';
import { getMachineConfig } from '../../machine_config.js';
import { AuthenticatedBackup } from '../authenticated_backup.js';
import { Backup } from '../backup.js';
import { BACKUP_WORKSPACE_DIR, BackupManifest } from '../backup_manifest.js';
import { RestoreError } from './types.js';

/**
 * Opens and authenticates the backup to restore. Dispose of the result when
 * done with it.
 */
export async function openBackup(
  backupPath: string
): Promise<Result<AuthenticatedBackup, RestoreError>> {
  const openBackupResult = await new Backup(backupPath).open();
  if (openBackupResult.isErr()) {
    const error = openBackupResult.err();
    return err({
      type:
        error.type === 'authentication-failed'
          ? 'backup-authentication-failed'
          : 'backup-read-failed',
      message: error.message,
    });
  }

  return ok(openBackupResult.ok());
}

/**
 * Reads the authenticated manifest and checks that it describes a backup this
 * software can restore. A backup made by a different machine is recorded
 * rather than refused: moving a backup between machines is how failed hardware
 * is replaced.
 */
export async function vetManifest(
  backup: AuthenticatedBackup,
  logger: BaseLogger
): Promise<Result<BackupManifest, RestoreError>> {
  const readManifestResult = await backup.readManifest();

  if (readManifestResult.isErr()) {
    const error = readManifestResult.err();
    switch (error.type) {
      case 'unsupported-version': {
        return err({
          type: 'unsupported-backup-version',
          message: error.message,
        });
      }

      /* istanbul ignore next: the manifest was read whole while it was being
         authenticated, so a read that fails now means its private copy went
         missing underneath us */
      case 'read-failed':
      case 'invalid-manifest': {
        return err({
          type: 'backup-read-failed',
          message: error.message,
        });
      }

      /* istanbul ignore next: Compile-time check for completeness */
      default: {
        throwIllegalValue(error, 'type');
      }
    }
  }
  const manifest = readManifestResult.ok();

  if (manifest.softwareVersion !== LATEST_SOFTWARE_VERSION) {
    return err({
      type: 'unsupported-software-version',
      message: `Expected software version ${LATEST_SOFTWARE_VERSION}`,
    });
  }

  const { machineId } = getMachineConfig();
  if (manifest.machineId !== machineId) {
    logger.log(LogEventId.BackupRestoreMachineMismatch, 'system', {
      backupManifestMachineId: manifest.machineId,
      machineId,
      message: `Backup was created by ${manifest.machineId} which does not match ${machineId}`,
    });
  }

  const workspacePrefix = `${BACKUP_WORKSPACE_DIR}/`;
  for (const file of manifest.files) {
    // The manifest is the signed statement of what the backup holds, so an
    // entry this software does not know how to restore means the backup cannot
    // be reproduced faithfully. Refusing loudly beats silently skipping it.
    if (!file.path.startsWith(workspacePrefix)) {
      return err({
        type: 'backup-verification-failed',
        message: `Manifest names a file this software does not know how to restore: ${file.path}`,
      });
    }
  }

  return ok(manifest);
}
