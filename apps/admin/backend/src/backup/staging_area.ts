import assert from 'node:assert';
import { link, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative } from 'node:path';
import { err, iter, ok, Result } from '@votingworks/basics';
import {
  FileLock,
  isLockHeldElsewhereError,
  tryLockFileExclusive,
} from '@votingworks/fs';
import { WorkspaceLayout } from '../util/workspace_layout.js';

const COPY_ROOT = 'copy-root';

/**
 * Returned when a workspace already has a backup running against it.
 */
export interface StagingAreaBusyError {
  type: 'staging-area-busy';
  message: string;
}

/**
 * Details for files that have been staged.
 */
export interface StagedFile {
  path: string;
  relativePath: string;
  size: number;
}

/**
 * Manages a staging area where files to be backed up are linked from their
 * original locations before being copied to the backup target. Keeps its own
 * internal list of files based on calls to its API. It will NOT simply copy
 * everything from `stagingAreaPath`. Use {@link linkWorkspaceFile} to hard
 * link an existing file into the staging area or {@link prepareStagingPath}
 * to ensure the file is ready to write, then write it yourself, then call
 * {@link markStagingPathReady} to ensure it is copied.
 */
export class BackupStagingArea {
  private readonly preparedPaths = new Set<string>();
  private readonly readyFiles = new Map<string, { size: number }>();

  private constructor(
    private readonly layout: WorkspaceLayout,
    private readonly stagingAreaPath: string,
    private readonly lock: FileLock
  ) {}

  /**
   * Creates the workspace's staging area for the links to go, reclaiming any a
   * killed run left behind, and holds a lock for as long as it exists. When
   * you're done with it you must call {@link cleanup}.
   *
   * The lock is what makes reclaiming safe: the staging area is at a fixed
   * path, so without it a second run would delete a live one's staged files.
   * It covers staging only — the target's in-progress directory is a separate
   * race, and one that predates this.
   */
  static async inWorkspace(
    layout: WorkspaceLayout
  ): Promise<Result<BackupStagingArea, StagingAreaBusyError>> {
    const lockResult = await tryLockFileExclusive(layout.backupStagingLockPath);

    if (lockResult.isErr() && isLockHeldElsewhereError(lockResult.err())) {
      return err({
        type: 'staging-area-busy',
        message: 'Another backup of this workspace is already running',
      });
    }

    // Any other failure to lock is not something a caller can act on.
    const lock = lockResult.unsafeUnwrap();
    const stagingAreaPath = layout.backupStagingPath;

    try {
      // A staging area only outlives the run that made it when that run was
      // killed, so anything here is dead. Reclaiming it before free space is
      // measured matters: a killed run's database snapshot is a real copy, and
      // counting it against the space this backup needs would block every
      // later backup until someone cleaned up by hand.
      await rm(stagingAreaPath, { recursive: true, force: true });
      await mkdir(stagingAreaPath, { recursive: true });
    } catch (error) {
      await lock.release();
      throw error;
    }

    return ok(new BackupStagingArea(layout, stagingAreaPath, lock));
  }

  /**
   * Ensures the location for the given workspace file is ready to be written,
   * i.e. its destination directory exists. Returns the location within the
   * staging area to write the file.
   *
   * Call {@link markStagingPathReady} once you've finished writing the file.
   */
  async prepareStagingPath(workspaceFilePath: string): Promise<string> {
    const destPath = join(
      this.stagingAreaPath,
      COPY_ROOT,
      this.layout.relativeToContent(workspaceFilePath)
    );

    assert(
      !this.readyFiles.has(destPath),
      'Path is already ready and cannot be prepared again without canceling first.'
    );
    assert(
      !this.preparedPaths.has(destPath),
      'Path is already prepared! You need to cancel it first before calling again.'
    );
    this.preparedPaths.add(destPath);

    await mkdir(dirname(destPath), { recursive: true });
    return destPath;
  }

  /**
   * Marks an already-prepared path as staged and ready to copy. This must be
   * called for files registered with {@link prepareStagingPath} in order for a
   * file to be listed by {@link listStagedFiles}.
   */
  async markStagingPathReady(path: string): Promise<void> {
    assert(
      !this.readyFiles.has(path),
      'Cannot mark an already-ready path as ready again. Cancel it first.'
    );
    assert(
      this.preparedPaths.delete(path),
      'Cannot mark a path as ready without preparing it first.'
    );

    assert(isAbsolute(path));
    const normalized = normalize(path);
    const fileStat = await stat(normalized);
    assert(fileStat.isFile());
    this.readyFiles.set(normalized, { size: fileStat.size });
  }

  /**
   * Links `sourcePath` to an equivalent workspace-relative path within the
   * staging area so it can later be copied to the backup target. Equivalent
   * to {@link prepareStagingPath} + `ln` + {@link markStagingPathReady}.
   */
  async linkWorkspaceFile(sourcePath: string): Promise<string> {
    const destPath = await this.prepareStagingPath(sourcePath);
    await link(sourcePath, destPath);
    await this.markStagingPathReady(destPath);
    return destPath;
  }

  /**
   * Number of staged files.
   */
  get fileCount(): number {
    return this.readyFiles.size;
  }

  /**
   * Number of bytes all staged files contain combined.
   */
  get fileSizeBytes(): number {
    return iter(this.readyFiles)
      .map(([, { size }]) => size)
      .sum();
  }

  /**
   * Lists all files to be copied to the backup target. `relativePath` is the
   * file's location relative to the staging root, i.e. where it should land
   * within the backup target's workspace directory.
   *
   * @throws if any path is "prepared" without being marked ready or canceled
   */
  listStagedFiles(): StagedFile[] {
    assert(
      this.preparedPaths.size === 0,
      'Cannot list staged files while some prepared paths have not been ' +
        'marked ready - a file may be silently missing from the backup.'
    );

    const copyRootPath = join(this.stagingAreaPath, COPY_ROOT);
    return iter(this.readyFiles)
      .map(([path, meta]) => ({
        path,
        relativePath: relative(copyRootPath, path),
        size: meta.size,
      }))
      .toArray();
  }

  /**
   * Deletes the staging area directory and all its contained links. All links'
   * original data locations are left unchanged, but any data written directly
   * to the staging area will be deleted.
   */
  async cleanup(): Promise<void> {
    await rm(this.stagingAreaPath, { recursive: true, force: true });
    this.preparedPaths.clear();
    this.readyFiles.clear();
    await this.lock.release();
  }
}
