import express, { Application } from 'express';
import * as grout from '@votingworks/grout';
import { assert, Optional } from '@votingworks/basics';
import { type SystemSettings } from '@votingworks/types';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import { HostConnectionStatus, ElectionRecord, MachineConfig } from './types';
import { rootDebug } from './util/debug';

const debug = rootDebug.extend('peer-app');

/**
 * Context for the peer API server.
 */
export interface PeerAppContext {
  workspace: Workspace;
}

function buildPeerApi({ workspace }: PeerAppContext) {
  return grout.createApi({
    connectToHost(input: { machineId: string }): MachineConfig {
      debug(
        'Client %s connected to host (election: %s)',
        input.machineId,
        workspace.store.getCurrentElectionId() ?? 'none'
      );
      workspace.store.setNetworkedMachineStatus(
        input.machineId,
        'client',
        HostConnectionStatus.Connected
      );
      return getMachineConfig();
    },

    getCurrentElectionMetadata(): Optional<ElectionRecord> {
      const currentElectionId = workspace.store.getCurrentElectionId();
      if (!currentElectionId) return undefined;
      const record = workspace.store.getElection(currentElectionId);
      assert(record);
      return record;
    },

    getSystemSettings(): Optional<SystemSettings> {
      const currentElectionId = workspace.store.getCurrentElectionId();
      if (!currentElectionId) return undefined;
      return workspace.store.getSystemSettings(currentElectionId);
    },
  });
}

/**
 * A type to be used by clients to create a Grout API client for the peer API.
 */
export type PeerApi = ReturnType<typeof buildPeerApi>;

/**
 * Builds the peer API express application for the host.
 */
export function buildPeerApp(context: PeerAppContext): Application {
  const app: Application = express();
  const api = buildPeerApi(context);
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
