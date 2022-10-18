import { emptyDirSync, ensureDirSync } from 'fs-extra';
import { join, resolve } from 'path';
import { Store } from '../store';

export interface Workspace {
  /**
   * The path to the workspace root.
   */
  readonly path: string;

  /**
   * The directory where interpreted images are stored.
   */
  readonly ballotImagesPath: string;

  /**
   * The directory where the scanner will save images.
   */
  readonly scannedImagesPath: string;

  /**
   * The directory where files are uploaded.
   */
  readonly uploadsPath: string;

  /**
   * The store associated with the workspace.
   */
  readonly store: Store;

  /**
   * Zero out the data in the workspace, but leave the election configuration.
   */
  zero(): void;

  /**
   * Reset the workspace, including the election configuration. This is the same
   * as deleting the workspace and recreating it.
   */
  reset(): void;

  /**
   * Clears the uploads directory.
   */
  clearUploads(): void;
}

export function createWorkspace(root: string): Workspace {
  const resolvedRoot = resolve(root);
  const ballotImagesPath = join(resolvedRoot, 'ballot-images');
  const scannedImagesPath = join(ballotImagesPath, 'scanned-images');
  const uploadsPath = join(resolvedRoot, 'uploads');
  ensureDirSync(ballotImagesPath);
  ensureDirSync(scannedImagesPath);

  const dbPath = join(resolvedRoot, 'ballots.db');
  const store = Store.fileStore(dbPath);

  return {
    path: resolvedRoot,
    ballotImagesPath,
    scannedImagesPath,
    uploadsPath,
    store,
    zero() {
      store.zero();
      emptyDirSync(ballotImagesPath);
      emptyDirSync(scannedImagesPath);
      ensureDirSync(ballotImagesPath);
      ensureDirSync(scannedImagesPath);
    },
    reset() {
      store.reset();
      emptyDirSync(ballotImagesPath);
      emptyDirSync(scannedImagesPath);
      ensureDirSync(ballotImagesPath);
      ensureDirSync(scannedImagesPath);
    },
    clearUploads() {
      emptyDirSync(uploadsPath);
    },
  };
}
