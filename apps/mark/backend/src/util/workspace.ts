import { ensureDirSync } from 'fs-extra';
import { join, resolve } from 'node:path';
import { BaseLogger } from '@votingworks/logging';
import {
  getDiskSpaceSummary as baseGetDiskSpaceSummary,
  DiskSpaceSummary,
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
   * Gets a summary of disk space usage.
   */
  getDiskSpaceSummary(): Promise<DiskSpaceSummary>;
}

export function createWorkspace(
  root: string,
  baseLogger: BaseLogger,
  options: { store?: Store } = {}
): Workspace {
  const resolvedRoot = resolve(root);
  ensureDirSync(resolvedRoot);

  const dbPath = join(resolvedRoot, 'mark.db');
  const store = options.store || Store.fileStore(dbPath, baseLogger);

  return {
    path: resolvedRoot,
    store,
    reset() {
      store.reset();
    },
    getDiskSpaceSummary: () => baseGetDiskSpaceSummary([resolvedRoot]),
  };
}
