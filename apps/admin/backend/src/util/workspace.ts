import { ensureDirSync } from 'fs-extra';
import { join, resolve } from 'node:path';
import {
  DiskSpaceSummary,
  initializeGetWorkspaceDiskSpaceSummary,
} from '@votingworks/backend';
import { BaseLogger } from '@votingworks/logging';
import { Store } from '../store';

/**
 * Options for defining a Workspace.
 */
export interface Workspace {
  readonly path: string;
  readonly store: Store;
  getDiskSpaceSummary: () => Promise<DiskSpaceSummary>;
}

/**
 * Returns a Workspace with the path of the working directory and store.
 */
export function createWorkspace(root: string, logger: BaseLogger): Workspace {
  const resolvedRoot = resolve(root);
  ensureDirSync(resolvedRoot);

  const dbPath = join(resolvedRoot, 'data.db');
  const store = Store.fileStore(dbPath, logger);

  // check disk space on summary to detect a new maximum available disk space
  const getWorkspaceDiskSpaceSummary = initializeGetWorkspaceDiskSpaceSummary(
    store,
    [resolvedRoot]
  );

  return {
    path: resolvedRoot,
    store,
    getDiskSpaceSummary: getWorkspaceDiskSpaceSummary,
  };
}
