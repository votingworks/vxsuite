import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import {
  authenticateArtifactUsingSignatureFile,
  constructSignatureFilePath,
  VXADMIN_BACKUP_MANIFEST_FILE_NAME,
} from '@votingworks/auth';
import { err, extractErrorMessage, ok, Result } from '@votingworks/basics';
import { copyFile, CopyFileError } from '@votingworks/fs';
import { AuthenticatedBackup } from './authenticated_backup.js';

const BACKUP_MANIFEST_MAX_SIZE = 100_000_000; // 100 MB
const BACKUP_MANIFEST_SIGNATURE_MAX_SIZE = 100_000; // 100 KB

/**
 * Why a backup could not be opened. Kept apart from each other because they
 * mean different things to whoever is holding the drive: one is damage, the
 * other is a backup this machine has no reason to trust.
 */
export type BackupOpenError =
  | { type: 'read-failed'; message: string }
  | { type: 'authentication-failed'; message: string };

/**
 * Helper for managing a complete on-disk backup.
 */
export class Backup {
  constructor(private readonly backupPath: string) {}

  get path(): string {
    return this.backupPath;
  }

  get manifestPath(): string {
    return join(this.backupPath, VXADMIN_BACKUP_MANIFEST_FILE_NAME);
  }

  get signaturePath(): string {
    return constructSignatureFilePath({
      type: 'vxadmin_backup',
      context: 'import',
      directoryPath: this.backupPath,
    });
  }

  /**
   * Authenticates this backup's manifest, yielding the only handle from which
   * a manifest can be read. Dispose of the result when done with it.
   */
  async open(): Promise<Result<AuthenticatedBackup, BackupOpenError>> {
    const stagingPath = await mkdtemp(join(tmpdir(), 'vxadmin-backup-'));
    let opened = false;

    try {
      const copyManifestResult = await copyFile({
        source: this.manifestPath,
        destination: join(stagingPath, VXADMIN_BACKUP_MANIFEST_FILE_NAME),
        maxSize: BACKUP_MANIFEST_MAX_SIZE,
      });
      if (copyManifestResult.isErr()) {
        return err({
          type: 'read-failed',
          message: describeCopyFileError(
            this.manifestPath,
            copyManifestResult.err()
          ),
        });
      }

      const copySignatureResult = await copyFile({
        source: this.signaturePath,
        destination: constructSignatureFilePath({
          type: 'vxadmin_backup',
          context: 'import',
          directoryPath: stagingPath,
        }),
        maxSize: BACKUP_MANIFEST_SIGNATURE_MAX_SIZE,
      });
      if (copySignatureResult.isErr()) {
        const error = copySignatureResult.err();
        // A signature that isn't there is a backup this machine can't trust;
        // a signature that's there but can't be read is damage, the same as
        // for any other file.
        return err({
          type:
            error.type === 'OpenFileError'
              ? 'authentication-failed'
              : 'read-failed',
          message: describeCopyFileError(this.signaturePath, error),
        });
      }

      const authenticateResult = await authenticateArtifactUsingSignatureFile({
        type: 'vxadmin_backup',
        context: 'import',
        directoryPath: stagingPath,
      });
      if (authenticateResult.isErr()) {
        return err({
          type: 'authentication-failed',
          message: extractErrorMessage(authenticateResult.err()),
        });
      }

      opened = true;
      return ok(new AuthenticatedBackup(this.backupPath, stagingPath));
    } finally {
      if (!opened) {
        await rm(stagingPath, { recursive: true, force: true });
      }
    }
  }
}

/**
 * Describes a failure to copy one of a backup's files, naming the file, since
 * whoever is holding the drive has no other way to tell which one went wrong.
 */
function describeCopyFileError(path: string, error: CopyFileError): string {
  switch (error.type) {
    case 'FileExceedsMaxSize': {
      return `${path} is larger than the maximum of ${error.maxSize} bytes`;
    }

    default: {
      return `${extractErrorMessage(error.error)} (${path})`;
    }
  }
}
