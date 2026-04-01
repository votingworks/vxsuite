import { ensureDirSync } from 'fs-extra';
import { join, resolve } from 'node:path';
import { getDiskSpaceSummary as baseGetDiskSpaceSummary } from '@votingworks/backend';
import type { DiskSpaceSummary } from '@votingworks/utils';
import { BaseLogger } from '@votingworks/logging';
import { Store } from '../store';
import { ClientStore } from '../client_store';

/** Filename of the SQLite database within a workspace. */
export const WORKSPACE_DB_FILENAME = 'data.db';

/** Name of the ballot images subdirectory within a workspace. */
export const WORKSPACE_BALLOT_IMAGES_DIR = 'ballot-images';

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
export interface Workspace extends BaseWorkspace {
  readonly store: Store;
  readonly dbPath: string;
  readonly ballotImagesPath: string;
}

/**
 * Workspace for a client machine with in-memory connection state.
 */
export interface ClientWorkspace extends BaseWorkspace {
  readonly clientStore: ClientStore;
}

/**
 * Returns a host Workspace with ballot image storage and disk space monitoring.
 */
export function createWorkspace(root: string, logger: BaseLogger): Workspace {
  const resolvedRoot = resolve(root);
  const ballotImagesPath = join(resolvedRoot, WORKSPACE_BALLOT_IMAGES_DIR);
  const dbPath = join(resolvedRoot, WORKSPACE_DB_FILENAME);

  ensureDirSync(ballotImagesPath);
  const store = Store.fileStore(dbPath, ballotImagesPath, logger);

  return {
    path: resolvedRoot,
    dbPath,
    ballotImagesPath,
    store,
    getDiskSpaceSummary: () => baseGetDiskSpaceSummary([resolvedRoot]),
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
    getDiskSpaceSummary: () => baseGetDiskSpaceSummary([resolvedRoot]),
  };
}
