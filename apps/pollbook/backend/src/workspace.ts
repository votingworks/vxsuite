import { ensureDirSync } from 'fs-extra';
import { join } from 'node:path';

import { BaseLogger } from '@votingworks/logging';
import * as grout from '@votingworks/grout';
import { PeerWorkspace, LocalWorkspace } from './types';
import { LocalStore } from './local_store';
import { PeerStore } from './peer_store';
import { PeerApi } from './peer_app';

export function createLocalWorkspace(
  workspacePath: string,
  logger: BaseLogger,
  peerPort: number,
  machineId: string,
  codeVersion: string
): LocalWorkspace {
  ensureDirSync(workspacePath);

  const assetDirectoryPath = join(workspacePath, 'assets');
  ensureDirSync(assetDirectoryPath);

  const dbPath = join(workspacePath, 'pollbook-backend.db');
  const store = LocalStore.fileStore(dbPath, logger, machineId, codeVersion);
  const peerApiClient = grout.createClient<PeerApi>({
    baseUrl: `http://localhost:${peerPort}/api`,
  });

  return { assetDirectoryPath, store, peerApiClient };
}

export function createPeerWorkspace(
  workspacePath: string,
  logger: BaseLogger,
  machineId: string,
  codeVersion: string
): PeerWorkspace {
  ensureDirSync(workspacePath);

  const assetDirectoryPath = join(workspacePath, 'assets');
  ensureDirSync(assetDirectoryPath);
  const dbPath = join(workspacePath, 'pollbook-backend.db');
  const store = PeerStore.fileStore(dbPath, logger, machineId, codeVersion);

  return { assetDirectoryPath, store };
}
