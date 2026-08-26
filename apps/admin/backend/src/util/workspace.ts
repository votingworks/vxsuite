import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensureDirSync } from 'fs-extra';
import { getDiskSpaceSummaries, getNodeEnv } from '@votingworks/backend';
import type { DiskSpaceSummary } from '@votingworks/utils';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import { Store } from '../store.js';
import { ClientStore } from '../client_store.js';
import { WorkspaceLayout } from './workspace_layout.js';

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

  /**
   * Where everything in this workspace lives, for callers that need a path
   * the store does not hand out.
   */
  readonly layout: WorkspaceLayout;
}

/**
 * Workspace for a client machine with in-memory connection state.
 */
export interface ClientWorkspace extends BaseWorkspace {
  readonly clientStore: ClientStore;
}

function buildWorkspace(
  layout: WorkspaceLayout,
  logger: BaseLogger
): Workspace {
  const store = Store.fileStore(
    layout.dbPath,
    layout.ballotImagesPath,
    layout.electionPackagesPath,
    logger
  );

  return {
    path: layout.root,
    layout,
    store,
    getDiskSpaceSummary: async () => {
      const [summary] = await getDiskSpaceSummaries([layout.root]);
      return summary;
    },
    [Symbol.dispose]: () => {
      store.close();
    },
  };
}

/**
 * Returns a host Workspace with ballot image storage and disk space monitoring.
 */
export function createWorkspace(root: string, logger: BaseLogger): Workspace {
  const layout = new WorkspaceLayout(root);

  layout.migrateContent();
  ensureDirSync(layout.ballotImagesPath);
  ensureDirSync(layout.electionPackagesPath);

  return buildWorkspace(layout, logger);
}

/**
 * Opens an existing workspace and throws ENOENT if it does not exist.
 */
export function openWorkspace(root: string, logger: BaseLogger): Workspace {
  const layout = new WorkspaceLayout(root);

  layout.migrateContent();

  // Ensure everything we expect is already there.
  statSync(layout.dbPath);
  statSync(layout.ballotImagesPath);
  statSync(layout.electionPackagesPath);

  return buildWorkspace(layout, logger);
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
/* istanbul ignore next - ADMIN_WORKSPACE is not set in tests */
export function resolveWorkspacePath(logger: BaseLogger): string {
  const workspacePath =
    process.env.ADMIN_WORKSPACE ??
    (getNodeEnv() === 'development'
      ? join(import.meta.dirname, '../dev-workspace')
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
