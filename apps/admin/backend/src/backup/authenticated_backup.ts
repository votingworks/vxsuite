import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { VXADMIN_BACKUP_MANIFEST_FILE_NAME } from '@votingworks/auth';
import { Result } from '@votingworks/basics';
import { BackupManifest } from './backup_manifest.js';
import {
  BackupManifestFile,
  ReadManifestError,
} from './backup_manifest_file.js';

/**
 * A backup whose manifest has been authenticated, and the only way to read one.
 * Obtained from {@link Backup.open}.
 *
 * The manifest is read from a private copy taken while authenticating it, not
 * from the backup itself, so the bytes parsed here are the same bytes whose
 * signature was checked. A backup normally sits on removable media that we do
 * not control, so re-reading it could yield something else entirely.
 *
 * That copy is a temporary directory, which is why this must be disposed:
 *
 * ```ts
 * await using backup = (await new Backup(path).open()).unsafeUnwrap();
 * ```
 *
 * Note that only the manifest is authenticated. The rest of the backup is
 * covered by the hashes *within* the manifest, and still lives on untrusted
 * media, so each file has to be verified against its manifest entry as it is
 * read.
 */
export class AuthenticatedBackup implements AsyncDisposable {
  constructor(
    private readonly backupPath: string,
    private readonly stagingPath: string
  ) {}

  /**
   * Where the backup itself lives, i.e. where its files are to be read from.
   */
  get path(): string {
    return this.backupPath;
  }

  /**
   * Reads the authenticated manifest. Authentication proves the manifest is
   * ours; this may still fail if it is a manifest we cannot understand, such as
   * one from a newer release.
   */
  readManifest(): Promise<Result<BackupManifest, ReadManifestError>> {
    return new BackupManifestFile(
      join(this.stagingPath, VXADMIN_BACKUP_MANIFEST_FILE_NAME)
    ).readManifest();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await rm(this.stagingPath, { recursive: true, force: true });
  }
}
