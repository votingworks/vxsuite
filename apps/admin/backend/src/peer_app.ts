import express, { Application } from 'express';
import * as grout from '@votingworks/grout';
import { assert, Optional } from '@votingworks/basics';
import { Admin, type SystemSettings, type UserRole } from '@votingworks/types';
import { BaseLogger, LogEventId } from '@votingworks/logging';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import { ElectionRecord, MachineConfig } from './types';

import { rootDebug } from './util/debug';

const debug = rootDebug.extend('peer-app');

/**
 * Context for the peer API server.
 */
export interface PeerAppContext {
  workspace: Workspace;
  logger: BaseLogger;
}

function buildPeerApi({ workspace, logger }: PeerAppContext) {
  return grout.createApi({
    connectToHost(input: {
      machineId: string;
      status: Admin.ClientMachineStatus;
      authType: UserRole | null;
    }): MachineConfig & { isClientAdjudicationEnabled: boolean } {
      debug(
        'Client %s connected to host (election: %s, status: %s)',
        input.machineId,
        workspace.store.getCurrentElectionId() ?? 'none',
        input.status
      );
      const previous = workspace.store.getMachine(input.machineId);
      if (
        previous?.status !== input.status ||
        previous?.authType !== input.authType
      ) {
        logger.log(LogEventId.AdminNetworkStatus, 'system', {
          message: previous
            ? `Client ${input.machineId} status changed from ${previous.status} to ${input.status}.`
            : `New client ${input.machineId} connected to host with status ${input.status}.`,
          clientMachineId: input.machineId,
          previousStatus: previous?.status ?? 'unknown',
          newStatus: input.status,
          previousAuthType: previous?.authType ?? 'none',
          newAuthType: input.authType ?? 'none',
        });
      }
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
  context.logger.log(LogEventId.AdminNetworkStatus, 'system', {
    message: 'Peer API server initialized.',
  });
  return app;
}
