import { ensureDirSync } from 'fs-extra';
import { join } from 'path';

import { Store } from './store';

export interface Workspace {
  assetDirectoryPath: string;
  store: Store;
}

export function createWorkspace(workspacePath: string): Workspace {
  ensureDirSync(workspacePath);

  const assetDirectoryPath = join(workspacePath, 'assets');
  ensureDirSync(assetDirectoryPath);

  const dbPath = join(workspacePath, 'design-backend.db');
  const store = Store.fileStore(dbPath);

  return { assetDirectoryPath, store };
}
