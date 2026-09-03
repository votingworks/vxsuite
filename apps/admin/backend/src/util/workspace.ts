import { existsSync, statSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
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
 * Subdirectory of a workspace for the files that describe the machine rather
 * than hold its data: which mode it is in, whether a restore is underway. Kept
 * apart from the data so that emptying the data, which a restore does and
 * which recovering from an interrupted one does, leaves them alone. See
 * {@link emptyWorkspaceData}.
 */
export const WORKSPACE_CONTROL_DIRECTORY_NAME = 'control';

/**
 * Path of the directory described by {@link WORKSPACE_CONTROL_DIRECTORY_NAME}.
 */
export function getWorkspaceControlPath(workspacePath: string): string {
  return join(resolve(workspacePath), WORKSPACE_CONTROL_DIRECTORY_NAME);
}

/**
 * Dropped into a workspace's control directory while a restore is running and
 * removed only once it succeeds. Its presence afterwards means a restore was
 * interrupted partway through, so the workspace's data is nothing worth
 * keeping.
 */
export const RESTORE_IN_PROGRESS_MARKER_FILENAME = 'restore-in-progress';

/**
 * Path of the marker described by {@link RESTORE_IN_PROGRESS_MARKER_FILENAME}.
 */
export function getRestoreInProgressMarkerPath(workspacePath: string): string {
  return join(
    getWorkspaceControlPath(workspacePath),
    RESTORE_IN_PROGRESS_MARKER_FILENAME
  );
}

/**
 * Whether a restore was interrupted, implying the workspace data is incomplete.
 */
export function hasInterruptedRestore(workspacePath: string): boolean {
  return existsSync(getRestoreInProgressMarkerPath(workspacePath));
}

/**
 * Empties a workspace of its data, i.e. everything but the control directory,
 * and takes the restore-in-progress marker off, since empty data is not
 * half-restored data. What remains is an unconfigured workspace that has kept
 * its settings. Used to clear a workspace before a restore fills it and to
 * discard what a failed or interrupted restore left behind.
 */
export async function emptyWorkspaceData(workspacePath: string): Promise<void> {
  const resolvedPath = resolve(workspacePath);
  const entries = await readdir(resolvedPath);
  await Promise.all(
    entries
      .filter((entry) => entry !== WORKSPACE_CONTROL_DIRECTORY_NAME)
      .map((entry) =>
        rm(join(resolvedPath, entry), { recursive: true, force: true })
      )
  );

  // Last, so the marker never comes off while anything it describes remains.
  await rm(getRestoreInProgressMarkerPath(workspacePath), { force: true });
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
    // @coverage-defer
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
 * Opens a workspace's store if the workspace has a database, and creates nothing
 * where there is none: for looking at what a workspace holds while leaving it
 * as it is.
 */
export function openWorkspaceStoreIfPresent(
  root: string,
  logger: BaseLogger
): Store | undefined {
  const paths = workspacePaths(root);
  if (!existsSync(paths.db)) {
    return undefined;
  }

  return Store.fileStore(
    paths.db,
    paths.ballotImages,
    paths.electionPackages,
    logger
  );
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
