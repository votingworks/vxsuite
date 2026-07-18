import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { join } from 'node:path';
import { Result } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  PollbookEvent,
  PeerAppContext,
  ConfigurationError,
  PollbookConfigurationInformation,
} from './types';
import {
  fetchEventsFromConnectedPollbooks,
  resetNetworkSetup,
  setupMachineNetworking,
} from './networking';
import { pollNetworkForPollbookPackage } from './pollbook_package';
import { POLLBOOK_PACKAGE_ASSET_FILE_NAME } from './globals';
import { securityHeadersMiddleware } from './security_middleware';
import { RestartablePoller, setStopBackgroundTasks } from './background_tasks';

function buildApi(context: PeerAppContext, networkPoller: RestartablePoller) {
  const { workspace } = context;
  const { store } = workspace;

  return grout.createApi({
    getPollbookConfigurationInformation(): PollbookConfigurationInformation {
      return store.getPollbookConfigurationInformation();
    },

    getEvents(input: { lastEventSyncedPerNode: Record<string, number> }): {
      events: PollbookEvent[];
      configurationInformation: PollbookConfigurationInformation;
      hasMore: boolean;
    } {
      return {
        ...store.getNewEvents(input.lastEventSyncedPerNode),
        configurationInformation: store.getPollbookConfigurationInformation(),
      };
    },

    unconfigure() {
      networkPoller.restart();
    },

    async resetNetwork() {
      await resetNetworkSetup(context.machineId);
      store.clearConnectedPollbooks();
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

  // Apply security headers middleware first
  app.use(securityHeadersMiddleware);

  const networkPoller = new RestartablePoller(() =>
    pollNetworkForPollbookPackage(context)
  );
  const api = buildApi(context, networkPoller);
  app.use('/api', grout.buildRouter(api, express));

  // Streaming endpoint for sending the pollbook package zip file to a peer
  app.get('/file/pollbook-package', (_req, res) => {
    // Return a 404 if we are not configured
    if (!context.workspace.store.getElection()) {
      res.status(404).send('Pollbook package not found');
    }
    context.workspace.logger.log(LogEventId.ApiCall, 'system', {
      methodName: 'getPollbookPackage',
      disposition: 'success',
      message: 'Sending pollbook package zip file to peer',
    });

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

  const machineNetworkingPoller = setupMachineNetworking(context);
  const fetchEventsPoller = fetchEventsFromConnectedPollbooks(context);

  setStopBackgroundTasks(app, () => {
    networkPoller.stop();
    machineNetworkingPoller.stop();
    fetchEventsPoller.stop();
  });

  return app;
}
