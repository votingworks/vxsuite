import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { join } from 'node:path';
import { Result } from '@votingworks/basics';
import {
  MachineInformation,
  PollbookEvent,
  PeerAppContext,
  ConfigurationError,
} from './types';
import {
  fetchEventsFromConnectedPollbooks,
  setupMachineNetworking,
} from './networking';
import { pollNetworkForPollbookPackage } from './pollbook_package';
import { POLLBOOK_PACKAGE_ASSET_FILE_NAME } from './globals';

function buildApi(context: PeerAppContext) {
  const { workspace, machineId, codeVersion } = context;
  const { store } = workspace;

  return grout.createApi({
    getMachineInformation(): MachineInformation {
      const pollbookInformation = store.getMachineInformation();
      if (!pollbookInformation) {
        return {
          codeVersion,
          machineId,
        };
      }
      return {
        ...pollbookInformation,
        codeVersion,
        machineId,
      };
    },

    getEvents(input: { lastEventSyncedPerNode: Record<string, number> }): {
      events: PollbookEvent[];
      hasMore: boolean;
    } {
      return store.getNewEvents(input.lastEventSyncedPerNode);
    },

    unconfigure() {
      pollNetworkForPollbookPackage(context);
    },

    async configureFromPeerMachine(input: {
      machineId: string;
    }): Promise<Result<void, ConfigurationError>> {
      return await store.configureFromPeerMachine(
        workspace.assetDirectoryPath,
        input.machineId
      );
    },
  });
}

export type PeerApi = ReturnType<typeof buildApi>;

export function buildPeerApp(context: PeerAppContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));

  // Streaming endpoint for sending the pollbook package zip file to a peer
  app.get('/file/pollbook-package', (_req, res) => {
    // Return a 404 if we are not configured
    if (!context.workspace.store.getElection()) {
      res.status(404).send('Pollbook package not found');
    }
    const pollbookPackagePath = join(
      context.workspace.assetDirectoryPath,
      POLLBOOK_PACKAGE_ASSET_FILE_NAME
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${POLLBOOK_PACKAGE_ASSET_FILE_NAME}"`
    );
    res.sendFile(pollbookPackagePath, (e) => {
      if (e) {
        res.status(404).send('Pollbook package not found');
      }
    });
  });

  void setupMachineNetworking(context);
  fetchEventsFromConnectedPollbooks(context);
  pollNetworkForPollbookPackage(context);

  return app;
}
