import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Optional } from '@votingworks/basics';
import { getDiskSpaceSummaries, getNodeEnv } from '@votingworks/backend';
import { type BaseLogger, LogEventId } from '@votingworks/logging';
import { type DiskSpaceSummary, Mutex } from '@votingworks/utils';
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
   * A mutex to ensure that continuous export operations happen sequentially and do not interleave.
   */
  readonly continuousExportMutex: Mutex;

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
   * Returns a summary of disk space usage for use in diagnostics.
   */
  getDiskSpaceSummary: () => Promise<DiskSpaceSummary>;
}

export function createWorkspace(
  root: string,
  logger: BaseLogger,
  options: { store?: Store } = {}
): Workspace {
  const resolvedRoot = resolve(root);
  const ballotImagesPath = join(resolvedRoot, 'ballot-images');
  const scannedImagesPath = join(ballotImagesPath, 'scanned-images');
  const uploadsPath = join(resolvedRoot, 'uploads');
  mkdirSync(ballotImagesPath, { recursive: true });
  mkdirSync(scannedImagesPath, { recursive: true });

  const dbPath = join(resolvedRoot, 'ballots.db');
  const store = options.store || Store.fileStore(dbPath, logger);

  return {
    path: resolvedRoot,
    ballotImagesPath,
    scannedImagesPath,
    uploadsPath,
    store,
    continuousExportMutex: new Mutex(),
    resetElectionSession() {
      store.resetElectionSession();
      rmSync(ballotImagesPath, { recursive: true, force: true });
      rmSync(scannedImagesPath, { recursive: true, force: true });
      mkdirSync(ballotImagesPath, { recursive: true });
      mkdirSync(scannedImagesPath, { recursive: true });
    },
    reset() {
      store.reset();
      rmSync(ballotImagesPath, { recursive: true, force: true });
      rmSync(scannedImagesPath, { recursive: true, force: true });
      mkdirSync(ballotImagesPath, { recursive: true });
      mkdirSync(scannedImagesPath, { recursive: true });
    },
    clearUploads() {
      rmSync(uploadsPath, { recursive: true, force: true });
      mkdirSync(uploadsPath, { recursive: true });
    },
    getDiskSpaceSummary: async () => {
      const [summary] = await getDiskSpaceSummaries([resolvedRoot]);
      return summary;
    },
  };
}

export function resolveWorkspace(baseLogger: BaseLogger): Workspace {
  const workspacePath = getScanWorkspace();
  if (!workspacePath) {
    baseLogger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message:
        'workspace path could not be determined; pass a workspace or run with SCAN_WORKSPACE',
      disposition: 'failure',
    });
    throw new Error(
      'workspace path could not be determined; pass a workspace or run with SCAN_WORKSPACE'
    );
  }
  return createWorkspace(workspacePath, baseLogger);
}

/**
 * Where should the database and image files etc go?
 */
export function getScanWorkspace(): Optional<string> {
  return (
    process.env.SCAN_WORKSPACE ??
    (getNodeEnv() === 'development'
      ? join(import.meta.dirname, '../../dev-workspace')
      : undefined)
  );
}
