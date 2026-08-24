import { Dirent, Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { err, ok, Result } from '@votingworks/basics';
import { Backup } from './backup.js';

/**
 * The directory containing all VxAdmin backups within a root.
 */
const BACKUPS_DIRECTORY_NAME = 'vxadmin-backups';

/**
 * Expected errors that can occur when listing backups.
 */
export type ListBackupsError =
  | { type: 'root-not-found'; message: string }
  | { type: 'not-directory'; message: string };

/**
 * Helper for managing backups in a given location.
 */
export class BackupRoot {
  constructor(private readonly rootPath: string) {}

  get path(): string {
    return this.rootPath;
  }

  /**
   * Where a backup named `name` belongs within this root. Writers use this so
   * that what they produce is what {@link listBackups} finds.
   */
  pathFor(name: string): string {
    return join(this.rootPath, BACKUPS_DIRECTORY_NAME, name);
  }

  /**
   * Lists the backups within this root. A root without a backups directory
   * has no backups, e.g. a backup drive that has never been backed up to.
   */
  async listBackups(): Promise<Result<Backup[], ListBackupsError>> {
    let rootStat: Stats;
    try {
      rootStat = await stat(this.rootPath);
    } catch {
      return err({
        type: 'root-not-found',
        message: `${this.rootPath} does not exist`,
      });
    }
    if (!rootStat.isDirectory()) {
      return err({
        type: 'not-directory',
        message: `${this.rootPath} is not a directory`,
      });
    }

    const backupsPath = join(this.rootPath, BACKUPS_DIRECTORY_NAME);
    let entries: Dirent[];
    try {
      entries = await readdir(backupsPath, { withFileTypes: true });
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === 'ENOENT') {
        return ok([]);
      }
      if (code === 'ENOTDIR') {
        return err({
          type: 'not-directory',
          message: `${backupsPath} is not a directory`,
        });
      }
      throw error;
    }

    return ok(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => new Backup(join(entry.parentPath, entry.name)))
    );
  }
}
