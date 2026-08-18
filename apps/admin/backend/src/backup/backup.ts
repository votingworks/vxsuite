import { join } from 'node:path';
import { VXADMIN_BACKUP_MANIFEST_FILE_NAME } from '@votingworks/auth';
import { BackupManifestFile } from './backup_manifest_file.js';

/**
 * Helper for managing a complete on-disk backup.
 */
export class Backup {
  constructor(private readonly backupPath: string) {}

  get path(): string {
    return this.backupPath;
  }

  get manifestFile(): BackupManifestFile {
    return new BackupManifestFile(
      join(this.backupPath, VXADMIN_BACKUP_MANIFEST_FILE_NAME)
    );
  }
}
