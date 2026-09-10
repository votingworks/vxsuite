import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { ensureDirSync } from 'fs-extra';
import { isNonExistentFileOrDirectoryError } from '@votingworks/basics';
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
 * Workspace restore state information stored outside the db. `scheduled` means
 * the next boot should start in restore mode. `running` is written while a
 * restore is running, so finding it in a workspace on startup means the
 * workspace is from a failed restore and can be cleaned up.
 */
export type RestoreState = 'scheduled' | 'running';

const RESTORE_STATE_FILENAME = 'restore_state';

/**
 * Path of the file holding the workspace's {@link RestoreState}.
 */
export function getRestoreStatePath(workspacePath: string): string {
  return join(getWorkspaceControlPath(workspacePath), RESTORE_STATE_FILENAME);
}

/**
 * Returns the workspace's {@link RestoreState}, or `undefined` if it has none.
 */
export function getRestoreState(
  workspacePath: string
): RestoreState | undefined {
  let contents: string;
  try {
    contents = readFileSync(getRestoreStatePath(workspacePath), 'utf-8');
  } catch (error) {
    if (isNonExistentFileOrDirectoryError(error)) {
      return undefined;
    }
    throw error;
  }

  switch (contents.trim()) {
    case 'scheduled':
      return 'scheduled';
    case 'running':
      return 'running';
    default:
      return undefined;
  }
}

/**
 * Sets the workspace's {@link RestoreState}.
 */
export function setRestoreState(
  workspacePath: string,
  state: RestoreState
): void {
  const path = getRestoreStatePath(workspacePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, state, 'utf-8');
}

/**
 * Leaves the workspace with no {@link RestoreState}.
 */
export function clearRestoreState(workspacePath: string): void {
  rmSync(getRestoreStatePath(workspacePath), { force: true });
}

/**
 * Empties a workspace of its data, i.e. everything but the control directory,
 * and clears its restore state, since empty data is not half-restored data.
 * What remains is an unconfigured workspace that has kept its settings. Used to
 * clear a workspace before a restore fills it and to discard what a failed or
 * interrupted restore left behind.
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

  // Last, so the state never comes off while anything it describes remains.
  clearRestoreState(workspacePath);
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
