import { emptyDirSync, ensureDirSync } from 'fs-extra';
import { join, resolve } from 'path';
import { Store } from '../store';

/**
 * Options for defining a Workspace.
 */
export interface Workspace {
  readonly path: string;
  readonly store: Store;
  readonly uploadsPath: string;

  /**
   * Clears the uploads directory.
   */
  clearUploads(): void;
}

/**
 * Returns a Workspace with the path of the working directory and store.
 */
export function createWorkspace(root: string): Workspace {
  const resolvedRoot = resolve(root);
  const dbPath = join(resolvedRoot, 'data.db');
  const uploadsPath = join(resolvedRoot, 'uploads');

  ensureDirSync(resolvedRoot);

  return {
    path: resolvedRoot,
    store: Store.fileStore(dbPath),
    uploadsPath,
    clearUploads() {
      emptyDirSync(uploadsPath);
    },
  };
}
