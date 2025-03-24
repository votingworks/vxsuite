import { ensureDirSync } from 'fs-extra';
import { join } from 'node:path';

import { BaseLogger } from '@votingworks/logging';
import { Workspace } from './types';
import { Store } from './store';

export function createWorkspace(
  workspacePath: string,
  logger: BaseLogger,
  machineId: string
): Workspace {
  ensureDirSync(workspacePath);

  const assetDirectoryPath = join(workspacePath, 'assets');
  ensureDirSync(assetDirectoryPath);

  const dbPath = join(workspacePath, 'pollbook-backend.db');
  const store = Store.fileStore(dbPath, logger, machineId);

  return { assetDirectoryPath, store };
}
