import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { BaseLogger } from '@votingworks/logging';
import { Store } from './store.js';

export interface Workspace {
  assetDirectoryPath: string;
  store: Store;
}

// @coverage-exclude
export function createWorkspace(
  workspacePath: string,
  logger: BaseLogger,
  store: Store = Store.new(logger)
): Workspace {
  mkdirSync(workspacePath, { recursive: true });

  const assetDirectoryPath = join(import.meta.dirname, '../../frontend/build');
  mkdirSync(assetDirectoryPath, { recursive: true });

  return { assetDirectoryPath, store };
}
