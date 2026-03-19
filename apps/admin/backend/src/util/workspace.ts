import { ensureDirSync } from 'fs-extra';
import { join, resolve } from 'node:path';
import { getDiskSpaceSummary as baseGetDiskSpaceSummary } from '@votingworks/backend';
import type { DiskSpaceSummary } from '@votingworks/utils';
import { BaseLogger } from '@votingworks/logging';
import { Store } from '../store.js';
import { ClientStore } from '../client_store.js';

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
  const ballotImagesPath = join(resolvedRoot, 'ballot-images');
  const dbPath = join(resolvedRoot, 'data.db');

  ensureDirSync(ballotImagesPath);
  const store = Store.fileStore(dbPath, ballotImagesPath, logger);

  return {
    path: resolvedRoot,
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
