import { ensureDirSync } from 'fs-extra';
import { join, resolve } from 'path';
import { Store } from '../store';

/**
 * Options for defining a Workspace.
 */
export interface Workspace {
  readonly path: string;
  readonly store: Store;
}

/**
 * Returns a Workspace with the path of the working directory and store.
 */
export function createWorkspace(root: string): Workspace {
  const resolvedRoot = resolve(root);
  const dbPath = join(resolvedRoot, 'data.db');

  ensureDirSync(resolvedRoot);

  return {
    path: resolvedRoot,
    store: Store.fileStore(dbPath),
  };
}
