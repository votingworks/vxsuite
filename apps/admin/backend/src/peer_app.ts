import express, { Application } from 'express';
import * as grout from '@votingworks/grout';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';
import { rootDebug } from './util/debug';

const debug = rootDebug.extend('peer-app');

/**
 * Information about a connected client machine.
 */
export interface ConnectedClient {
  machineId: string;
  lastSeenAt: Date;
}

/**
 * Context for the peer API server.
 */
export interface PeerAppContext {
  workspace: Workspace;
}

const CLIENT_STALE_THRESHOLD_MS = 10_000;

function buildPeerApi({
  workspace,
  connectedClients,
}: PeerAppContext & { connectedClients: Map<string, ConnectedClient> }) {
  return grout.createApi({
    connectToHost(input: { machineId: string }): { status: 'ok' } {
      debug(
        'Client %s connected to host (election: %s)',
        input.machineId,
        workspace.store.getCurrentElectionId() ?? 'none'
      );
      connectedClients.set(input.machineId, {
        machineId: input.machineId,
        lastSeenAt: new Date(),
      });
      return { status: 'ok' };
    },

    getHostMachineConfig() {
      return getMachineConfig();
    },
  });
}

/**
 * A type to be used by clients to create a Grout API client for the peer API.
 */
export type PeerApi = ReturnType<typeof buildPeerApi>;

/**
 * Builds the peer API express application for the host. Returns the app and
 * a function to get the list of currently connected clients.
 */
export function buildPeerApp(context: PeerAppContext): {
  app: Application;
  getConnectedClients: () => ConnectedClient[];
} {
  const connectedClients = new Map<string, ConnectedClient>();
  const app: Application = express();
  const api = buildPeerApi({ ...context, connectedClients });
  app.use('/api', grout.buildRouter(api, express));

  function getConnectedClients(): ConnectedClient[] {
    const now = Date.now();
    // Remove stale clients
    for (const [machineId, client] of connectedClients) {
      if (now - client.lastSeenAt.getTime() > CLIENT_STALE_THRESHOLD_MS) {
        connectedClients.delete(machineId);
      }
    }
    return [...connectedClients.values()];
  }

  return { app, getConnectedClients };
}
