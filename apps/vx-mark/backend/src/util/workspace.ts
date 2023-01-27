import { join, resolve } from 'path';
import { Store } from '../store';

export interface Workspace {
  /**
   * The path to the workspace root.
   */
  readonly path: string;

  /**
   * The store associated with the workspace.
   */
  readonly store: Store;
}

export function createWorkspace(root: string): Workspace {
  const resolvedRoot = resolve(root);

  const dbPath = join(resolvedRoot, 'rave.db');
  const store = Store.fileStore(dbPath);

  return {
    path: resolvedRoot,
    store,
  };
}
