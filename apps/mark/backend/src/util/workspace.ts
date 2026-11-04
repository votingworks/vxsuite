import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BaseLogger } from '@votingworks/logging';
import { getDiskSpaceSummaries } from '@votingworks/backend';
import type { DiskSpaceSummary } from '@votingworks/utils';
import { Store } from '../store.js';

export interface Workspace extends Disposable {
  /**
   * The path to the workspace root.
   */
  readonly path: string;

  /**
   * The store associated with the workspace.
   */
  readonly store: Store;

  /**
   * The database holding the imported election package.
   */
  readonly electionPackageDbPath: string;

  /**
   * Unconfigures the machine: removes the election package and every session
   * record. The same as deleting the workspace and recreating it.
   */
  unconfigure(): void;

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
  mkdirSync(resolvedRoot, { recursive: true });

  const sessionDbPath = join(resolvedRoot, 'session.db');
  const electionPackageDbPath = join(resolvedRoot, 'election-package.db');
  const store =
    options.store ||
    Store.fileStore(sessionDbPath, electionPackageDbPath, baseLogger);

  return {
    path: resolvedRoot,
    store,
    electionPackageDbPath,
    unconfigure() {
      store.reset();
    },
    getDiskSpaceSummary: async () => {
      const [summary] = await getDiskSpaceSummaries([resolvedRoot]);
      return summary;
    },
    [Symbol.dispose]: () => {
      store.close();
    },
  };
}
