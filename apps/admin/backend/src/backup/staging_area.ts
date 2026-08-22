import assert from 'node:assert';
import { link, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize, relative } from 'node:path';
import { iter } from '@votingworks/basics';

const PREFIX = 'backup-staging-area-';
const PIDFILE = 'vxadmin.pid';
const COPY_ROOT = 'copy-root';

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
    private readonly workspacePath: string,
    private readonly stagingAreaPath: string
  ) {}

  /**
   * Creates a temporary directory within the workspace for the links to go.
   * When you're done with it you must call {@link cleanup}.
   */
  static async inWorkspace(workspacePath: string): Promise<BackupStagingArea> {
    const stagingAreaPath = await mkdtemp(join(workspacePath, PREFIX));
    await writeFile(join(stagingAreaPath, PIDFILE), `${process.pid}`);
    return new BackupStagingArea(workspacePath, stagingAreaPath);
  }

  /**
   * Ensures the location for the given workspace file is ready to be written,
   * i.e. its destination directory exists. Returns the location within the
   * staging area to write the file.
   *
   * Call {@link markStagingPathReady} once you've finished writing the file.
   */
  async prepareStagingPath(workspaceFilePath: string): Promise<string> {
    const relativePath = relative(this.workspacePath, workspaceFilePath);
    assert(!relativePath.startsWith('../'));
    const destPath = join(this.stagingAreaPath, COPY_ROOT, relativePath);

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
  }
}
