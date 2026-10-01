import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getDiskSpaceSummaries } from '@votingworks/backend';
import type { DiskSpaceSummary } from '@votingworks/utils';
import type { Id } from '@votingworks/types';
import type { BaseLogger } from '@votingworks/logging';
import { Store } from '../store.js';

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
   * Given a batch ID, returns the directory where the batch's images are stored.
   */
  batchImagesPath(batchId: Id): string;

  /**
   * The directory where files are uploaded.
   */
  readonly uploadsPath: string;

  /**
   * The store associated with the workspace.
   */
  readonly store: Store;

  /**
   * Zero out the data in the workspace, but leave the configuration.
   */
  resetElectionSession(): void;

  /**
   * Reset the workspace, including the election configuration. This is the same
   * as deleting the workspace and recreating it.
   */
  reset(): void;

  /**
   * Clears the uploads directory.
   */
  clearUploads(): void;

  /**
   * Clears incomplete batches from the database as well as their ballot image directories.
   */
  cleanupIncompleteBatches(): void;

  /**
   * Get the disk space summary for the workspace.
   */
  getDiskSpaceSummary: () => Promise<DiskSpaceSummary>;
}

const BATCH_IMAGES_DIRECTORY_PREFIX = 'batch-';

export function createWorkspace(root: string, logger: BaseLogger): Workspace {
  const resolvedRoot = resolve(root);
  const ballotImagesPath = join(resolvedRoot, 'ballot-images');
  const uploadsPath = join(resolvedRoot, 'uploads');
  mkdirSync(ballotImagesPath, { recursive: true });

  const dbPath = join(resolvedRoot, 'ballots.db');
  const store = Store.fileStore(dbPath, logger);

  function batchImagesPath(batchId: Id): string {
    return join(ballotImagesPath, `${BATCH_IMAGES_DIRECTORY_PREFIX}${batchId}`);
  }

  return {
    path: resolvedRoot,
    ballotImagesPath,
    batchImagesPath,
    uploadsPath,
    store,
    resetElectionSession() {
      store.resetElectionSession();
      rmSync(ballotImagesPath, { recursive: true, force: true });
      mkdirSync(ballotImagesPath, { recursive: true });
    },
    reset() {
      store.reset();
      rmSync(ballotImagesPath, { recursive: true, force: true });
      mkdirSync(ballotImagesPath, { recursive: true });
    },
    clearUploads() {
      rmSync(uploadsPath, { recursive: true, force: true });
      mkdirSync(uploadsPath, { recursive: true });
    },
    cleanupIncompleteBatches() {
      store.cleanupIncompleteBatches();
      const batchImagesPaths = new Set(
        store.getAllBatchIds().map(batchImagesPath)
      );
      for (const entry of readdirSync(ballotImagesPath)) {
        const entryPath = join(ballotImagesPath, entry);
        if (
          entry.startsWith(BATCH_IMAGES_DIRECTORY_PREFIX) &&
          !batchImagesPaths.has(entryPath)
        ) {
          rmSync(entryPath, { recursive: true, force: true });
        }
      }
    },
    getDiskSpaceSummary: async () => {
      const [summary] = await getDiskSpaceSummaries([resolvedRoot]);
      return summary;
    },
  };
}
