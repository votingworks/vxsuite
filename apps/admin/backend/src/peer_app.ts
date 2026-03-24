import express, { Application } from 'express';
import * as grout from '@votingworks/grout';
import { assert, Optional } from '@votingworks/basics';
import { type SystemSettings, type UserRole } from '@votingworks/types';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import { MachineStatus, ElectionRecord, MachineConfig } from './types';
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
    connectToHost(input: {
      machineId: string;
      status: MachineStatus;
      authType: UserRole | null;
    }): MachineConfig & { isClientAdjudicationEnabled: boolean } {
      debug(
        'Client %s connected to host (election: %s, status: %s)',
        input.machineId,
        workspace.store.getCurrentElectionId() ?? 'none',
        input.status
      );
      workspace.store.setNetworkedMachineStatus(
        input.machineId,
        'client',
        input.status,
        input.authType
      );
      return {
        ...getMachineConfig(),
        isClientAdjudicationEnabled:
          workspace.store.getIsClientAdjudicationEnabled(),
      };
    },

    getElectionPackageHash(): Optional<string> {
      const currentElectionId = workspace.store.getCurrentElectionId();
      if (!currentElectionId) return undefined;
      const record = workspace.store.getElection(currentElectionId);
      assert(record);
      return record.electionPackageHash;
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
