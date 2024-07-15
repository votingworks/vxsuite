import { ensureDirSync } from 'fs-extra';
import { join, resolve } from 'path';
import {
  DiskSpaceSummary,
  initializeGetWorkspaceDiskSpaceSummary,
} from '@votingworks/backend';
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

  /**
   * Reset the workspace, including the election configuration. This is the same
   * as deleting the workspace and recreating it.
   */
  reset(): void;

  /**
   * Get the disk space summary for the workspace.
   */
  getDiskSpaceSummary: () => Promise<DiskSpaceSummary>;
}

export function createWorkspace(
  root: string,
  options: { store?: Store } = {}
): Workspace {
  const resolvedRoot = resolve(root);
  ensureDirSync(resolvedRoot);

  const dbPath = join(resolvedRoot, 'mark.db');
  const store = options.store || Store.fileStore(dbPath);
  const getWorkspaceDiskSpaceSummary = initializeGetWorkspaceDiskSpaceSummary(
    store,
    [resolvedRoot]
  );

  return {
    path: resolvedRoot,
    store,
    reset() {
      store.reset();
    },
    getDiskSpaceSummary: getWorkspaceDiskSpaceSummary,
  };
}
