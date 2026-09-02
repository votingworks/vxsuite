import { err, ok, Result, throwIllegalValue } from '@votingworks/basics';
import { Logger, LogEventId } from '@votingworks/logging';
import { LATEST_SOFTWARE_VERSION } from '@votingworks/types';
import {
  getMachineConfig,
  getMachineJurisdiction,
} from '../../machine_config.js';
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
 * software can restore, and one this machine has any business restoring.
 *
 * A backup signed by a different machine is recorded rather than refused:
 * moving a backup between machines is how failed hardware is replaced. One
 * signed in a different *jurisdiction* is refused — no jurisdiction has cause
 * to restore another's data — which is what keeps "a different machine" from
 * meaning any VxAdmin in existence.
 */
export async function vetManifest(
  backup: AuthenticatedBackup,
  logger: Logger
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

  // Every machine's cert chains to the same VotingWorks CA, so a signature
  // says a VxAdmin signed this and nothing more. The signer's jurisdiction is
  // the one account of where a backup came from that its author did not write:
  // a manifest holds whatever the signer chose to type, while the jurisdiction
  // is what the CA issued them.
  const jurisdiction = getMachineJurisdiction();
  if (backup.signer.jurisdiction !== jurisdiction) {
    return err({
      type: 'backup-authentication-failed',
      message:
        `Backup was signed by a VxAdmin in jurisdiction ` +
        `${backup.signer.jurisdiction}, but this machine belongs to ` +
        `${jurisdiction}`,
    });
  }

  // Which machine made the backup is read from the signing cert, not from the
  // manifest. Restoring another machine's backup is allowed, so nothing
  // refuses a manifest naming the wrong machine — which is exactly why the
  // manifest's own account of its origin is not what gets recorded here.
  const { machineId } = getMachineConfig();
  if (backup.signer.machineId !== machineId) {
    await logger.logAsCurrentRole(LogEventId.BackupRestoreMachineMismatch, {
      signingMachineId: backup.signer.machineId,
      backupManifestMachineId: manifest.machineId,
      machineId,
      message: `Backup was created by ${backup.signer.machineId} which does not match ${machineId}`,
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
