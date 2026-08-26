import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { getNodeEnv } from '@votingworks/backend';

/**
 * Base name of the VxAdmin SQLite database.
 */
export const ADMIN_WORKSPACE_DATABASE_NAME = 'data.db';

/**
 * Holds everything a restore replaces. Kept in one directory so a restore can
 * build a complete replacement beside it and exchange the two in a single
 * atomic operation, rather than overwriting a live workspace file by file.
 */
const CONTENT_DIRECTORY_NAME = 'current';

/**
 * Where a restore builds replacement content before swapping it in. A fixed
 * name, like the backup staging area, so an interrupted restore is reclaimed
 * by the next one instead of accumulating.
 */
const INCOMING_CONTENT_DIRECTORY_NAME = 'incoming';

/**
 * Where {@link WorkspaceLayout.migrateContent} gathers the content of a
 * workspace laid out flat, before moving it into place as a whole.
 */
const MIGRATING_CONTENT_DIRECTORY_NAME = 'migrating';

const BACKUP_STAGING_DIRECTORY_NAME = 'backup-staging';
const BACKUP_STAGING_LOCKFILE_NAME = 'backup-staging.lock';

const MACHINE_MODE_FILENAME = 'machine_mode';

/**
 * Names a flat workspace kept in its root, which {@link
 * WorkspaceLayout.migrateContent} moves into the content directory. `data.db`
 * is matched with its SQLite sidecar files (e.g. a `data.db-journal` left by a
 * killed write), which must travel with it or the database they describe is
 * corrupt.
 */
function isContentEntryName(name: string): boolean {
  return (
    name === ADMIN_WORKSPACE_DATABASE_NAME ||
    name.startsWith(`${ADMIN_WORKSPACE_DATABASE_NAME}-`) ||
    name === 'ballot-images' ||
    name === 'election-packages'
  );
}

/**
 * Where everything within a VxAdmin workspace lives. This is the only place
 * that decides, so adding to a workspace, or moving what is already in one,
 * happens here rather than in every caller that builds a path by hand.
 *
 * A workspace is divided by what a restore does to it:
 *
 * - {@link contentPath} holds the election data — the database, ballot images,
 *   and election packages. A restore replaces this wholesale.
 * - everything else in the root ({@link backupStagingPath}, {@link
 *   backupStagingLockPath}, {@link incomingContentPath}) belongs to the
 *   machine rather than to the election, and survives a restore. In particular
 *   the lock has to: a lock exchanged out from under its holder locks nothing.
 */
export class WorkspaceLayout {
  private readonly rootPath: string;

  constructor(root: string) {
    this.rootPath = resolve(root);
  }

  get root(): string {
    return this.rootPath;
  }

  get contentPath(): string {
    return join(this.rootPath, CONTENT_DIRECTORY_NAME);
  }

  get incomingContentPath(): string {
    return join(this.rootPath, INCOMING_CONTENT_DIRECTORY_NAME);
  }

  get dbPath(): string {
    return join(this.contentPath, ADMIN_WORKSPACE_DATABASE_NAME);
  }

  get ballotImagesPath(): string {
    return join(this.contentPath, 'ballot-images');
  }

  get electionPackagesPath(): string {
    return join(this.contentPath, 'election-packages');
  }

  get backupStagingPath(): string {
    return join(this.rootPath, BACKUP_STAGING_DIRECTORY_NAME);
  }

  get backupStagingLockPath(): string {
    return join(this.rootPath, BACKUP_STAGING_LOCKFILE_NAME);
  }

  get machineModePath(): string {
    return join(this.rootPath, MACHINE_MODE_FILENAME);
  }

  /**
   * Where `path` sits within the content directory, i.e. how a backup names
   * it and where a restore must put it back. Throws if `path` is not within
   * the content directory, since a caller that got there by joining paths by
   * hand would otherwise silently write outside the workspace.
   */
  relativeToContent(path: string): string {
    const relativePath = relative(this.contentPath, resolve(path));

    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error(`${path} is not within ${this.contentPath}`);
    }

    return relativePath;
  }

  /**
   * Moves a workspace laid out flat, as every workspace was before the content
   * directory existed, into the content directory.
   */
  migrateContent(): void {
    if (
      // Production workspaces never span software versions.
      getNodeEnv() === 'production' ||
      existsSync(this.contentPath) ||
      !existsSync(this.rootPath)
    ) {
      return;
    }

    const migratingPath = join(this.rootPath, MIGRATING_CONTENT_DIRECTORY_NAME);
    const flatEntryNames = readdirSync(this.rootPath).filter(
      isContentEntryName
    );

    // Nothing to migrate: a workspace being created for the first time.
    if (flatEntryNames.length === 0 && !existsSync(migratingPath)) {
      return;
    }

    mkdirSync(migratingPath, { recursive: true });

    for (const name of flatEntryNames) {
      renameSync(join(this.rootPath, name), join(migratingPath, name));
    }

    renameSync(migratingPath, this.contentPath);
  }
}
