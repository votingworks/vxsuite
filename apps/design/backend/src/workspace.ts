import { ensureDirSync } from 'fs-extra';
import { join } from 'node:path';

import { BaseLogger } from '@votingworks/logging';
import { Store } from './store';

export interface Workspace {
  assetDirectoryPath: string;
  store: Store;
}

export function createWorkspace(
  workspacePath: string,
  logger: BaseLogger,
  store: Store = Store.new(logger)
): Workspace {
  ensureDirSync(workspacePath);

  const assetDirectoryPath = join(__dirname, '../../frontend/build');
  ensureDirSync(assetDirectoryPath);

  return { assetDirectoryPath, store };
}
