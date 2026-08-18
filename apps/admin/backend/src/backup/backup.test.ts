import { expect, test } from 'vitest';
import { Backup } from './backup.js';
import { BackupManifestFile } from './backup_manifest_file.js';

test('exposes the backup path', () => {
  expect(new Backup('/media/vx/backup/vxadmin-backups/backup-1').path).toEqual(
    '/media/vx/backup/vxadmin-backups/backup-1'
  );
});

test('locates the manifest file within the backup', () => {
  const backup = new Backup('/media/vx/backup/vxadmin-backups/backup-1');
  expect(backup.manifestFile).toBeInstanceOf(BackupManifestFile);
  expect(backup.manifestFile.path).toEqual(
    '/media/vx/backup/vxadmin-backups/backup-1/manifest.json'
  );
});
