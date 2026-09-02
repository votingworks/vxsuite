import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureDirSync } from 'fs-extra';
import { getDiskSpaceSummaries, getNodeEnv } from '@votingworks/backend';
import type { DiskSpaceSummary } from '@votingworks/utils';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import { Store } from '../store.js';
import { ClientStore } from '../client_store.js';

/**
 * Base name of the VxAdmin SQLite database.
 */
export const ADMIN_WORKSPACE_DATABASE_NAME = 'data.db';

/**
 * Dropped into a workspace while a restore is running and removed only once it
 * succeeds. Its presence afterwards means a restore was interrupted partway
 * through, so the workspace holds nothing worth keeping.
 */
export const RESTORE_IN_PROGRESS_MARKER_FILENAME = 'restore-in-progress';

/**
 * Path of the marker described by {@link RESTORE_IN_PROGRESS_MARKER_FILENAME}.
 */
export function getRestoreInProgressMarkerPath(workspacePath: string): string {
  return join(resolve(workspacePath), RESTORE_IN_PROGRESS_MARKER_FILENAME);
}

/**
 * Whether a restore was interrupted, implying the workspace data is incomplete.
 */
export function hasInterruptedRestore(workspacePath: string): boolean {
  return existsSync(getRestoreInProgressMarkerPath(workspacePath));
}

/**
 * Shared workspace interface for both host and client machines.
 */
export interface BaseWorkspace {
  readonly path: string;
  getDiskSpaceSummary: () => Promise<DiskSpaceSummary>;
}

/**
 * Workspace for a host machine with full election data support.
 */
export interface Workspace extends BaseWorkspace, Disposable {
  readonly store: Store;
}

/**
 * Workspace for a client machine with in-memory connection state.
 */
export interface ClientWorkspace extends BaseWorkspace {
  readonly clientStore: ClientStore;
}

function workspacePaths(root: string): {
  workspace: string;
  ballotImages: string;
  electionPackages: string;
  db: string;
} {
  const resolvedRoot = resolve(root);
  const ballotImagesPath = join(resolvedRoot, 'ballot-images');
  const electionPackagesPath = join(resolvedRoot, 'election-packages');
  const dbPath = join(resolvedRoot, ADMIN_WORKSPACE_DATABASE_NAME);

  return {
    workspace: resolvedRoot,
    ballotImages: ballotImagesPath,
    electionPackages: electionPackagesPath,
    db: dbPath,
  };
}

/**
 * Returns a host Workspace with ballot image storage and disk space monitoring.
 */
export function createWorkspace(root: string, logger: BaseLogger): Workspace {
  const paths = workspacePaths(root);

  ensureDirSync(paths.ballotImages);
  ensureDirSync(paths.electionPackages);
  const store = Store.fileStore(
    paths.db,
    paths.ballotImages,
    paths.electionPackages,
    logger
  );

  return {
    path: paths.workspace,
    store,
    getDiskSpaceSummary: async () => {
      const [summary] = await getDiskSpaceSummaries([paths.workspace]);
      return summary;
    },
    [Symbol.dispose]: () => {
      store.close();
    },
  };
}

/**
 * Opens an existing workspace and throws ENOENT if it does not exist.
 */
export function openWorkspace(root: string, logger: BaseLogger): Workspace {
  const paths = workspacePaths(root);

  // Ensure everything we expect is already there.
  statSync(paths.db);
  statSync(paths.ballotImages);
  statSync(paths.electionPackages);

  const store = Store.fileStore(
    paths.db,
    paths.ballotImages,
    paths.electionPackages,
    logger
  );

  return {
    path: paths.workspace,
    store,
    getDiskSpaceSummary: async () => {
      const [summary] = await getDiskSpaceSummaries([paths.workspace]);
      return summary;
    },
    [Symbol.dispose]: () => {
      store.close();
    },
  };
}

/**
 * Returns a client Workspace with in-memory connection state.
 */
export function createClientWorkspace(root: string): ClientWorkspace {
  const resolvedRoot = resolve(root);

  return {
    path: resolvedRoot,
    clientStore: new ClientStore(),
    getDiskSpaceSummary: async () => {
      const [summary] = await getDiskSpaceSummaries([resolvedRoot]);
      return summary;
    },
  };
}

/**
 * Path for the database file and other files
 */
// @coverage-exclude: ADMIN_WORKSPACE is not set in tests
export function resolveWorkspacePath(logger: BaseLogger): string {
  const workspacePath =
    process.env.ADMIN_WORKSPACE ??
    (getNodeEnv() === 'development'
      ? join(import.meta.dirname, '../../dev-workspace')
      : undefined);
  if (!workspacePath) {
    logger.log(LogEventId.WorkspaceConfigurationMessage, 'system', {
      message:
        'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE',
      disposition: 'failure',
    });
    throw new Error(
      'workspace path could not be determined; pass a workspace or run with ADMIN_WORKSPACE'
    );
  }
  return resolve(workspacePath);
}
