import { ensureDirSync } from 'fs-extra';
import { join, resolve } from 'path';
import { DiskSpaceSummary, getDiskSpaceSummary } from '@votingworks/backend';
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
 * Returns the disk space summary for the workspace - the total, used, and
 * available. Rather than rely on the volume's disk space summary, we track the
 * maximum available disk space over time and use that as the total. As such,
 * we're not counting fixed disk space (code, config, etc.) as unavailable and
 * have a more accurate picture of the disk space available to the application.
 *
 * While checking, this method will also update the store with a new maximum
 * disk space if the current available disk space is greater than the
 * previous maximum.
 */
async function getWorkspaceDiskSpaceSummary(
  store: Store,
  workspacePath: string
): Promise<DiskSpaceSummary> {
  const previousMaximumDiskSpace = store.getMaximumWorkspaceDiskSpace();
  const currentDiskSpaceSummary = await getDiskSpaceSummary([workspacePath]);

  const maximumDiskSpace = Math.max(
    previousMaximumDiskSpace,
    currentDiskSpaceSummary.available
  );

  if (maximumDiskSpace > previousMaximumDiskSpace) {
    store.updateMaximumWorkspaceDiskSpace(maximumDiskSpace);
  }

  return {
    total: maximumDiskSpace,
    available: currentDiskSpaceSummary.available,
    used: maximumDiskSpace - currentDiskSpaceSummary.available,
  };
}

/**
 * Returns a Workspace with the path of the working directory and store.
 */
export function createWorkspace(root: string): Workspace {
  const resolvedRoot = resolve(root);
  ensureDirSync(resolvedRoot);

  const dbPath = join(resolvedRoot, 'data.db');
  const store = Store.fileStore(dbPath);

  // check disk space on summary to detect a new maximum available disk space
  void getWorkspaceDiskSpaceSummary(store, resolvedRoot);

  return {
    path: resolvedRoot,
    store,
    getDiskSpaceSummary: () =>
      getWorkspaceDiskSpaceSummary(store, resolvedRoot),
  };
}
