import { ensureDirSync } from 'fs-extra';
import { join } from 'node:path';

import { BaseLogger } from '@votingworks/logging';
import { PeerWorkspace, LocalWorkspace } from './types';
import { LocalStore } from './local_store';
import { PeerStore } from './peer_store';

export function createLocalWorkspace(
  workspacePath: string,
  logger: BaseLogger,
  machineId: string
): LocalWorkspace {
  ensureDirSync(workspacePath);

  const assetDirectoryPath = join(workspacePath, 'assets');
  ensureDirSync(assetDirectoryPath);

  const dbPath = join(workspacePath, 'pollbook-backend.db');
  const store = LocalStore.fileStore(dbPath, logger, machineId);

  return { assetDirectoryPath, store };
}

export function createPeerWorkspace(
  workspacePath: string,
  logger: BaseLogger,
  machineId: string
): PeerWorkspace {
  ensureDirSync(workspacePath);

  const dbPath = join(workspacePath, 'pollbook-backend.db');
  const store = PeerStore.fileStore(dbPath, logger, machineId);

  return { store };
}
