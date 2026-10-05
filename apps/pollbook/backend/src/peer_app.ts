import * as grout from '@votingworks/grout';
import express, { type Application } from 'express';
import { join } from 'node:path';
import type { Result } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import {
  assertPeerComponent,
  assertPeerMachineId,
  buildPeerTlsIdentityMiddleware,
  PeerIdentityError,
} from '@votingworks/networking';
import type {
  PollbookEvent,
  PeerAppContext,
  ConfigurationError,
  PollbookConfigurationInformation,
} from './types.js';
import {
  fetchEventsFromConnectedPollbooks,
  resetNetworkSetup,
  setupMachineNetworking,
} from './networking.js';
import { pollNetworkForPollbookPackage } from './pollbook_package.js';
import { POLLBOOK_PACKAGE_ASSET_FILE_NAME } from './globals.js';
import { securityHeadersMiddleware } from './security_middleware.js';

function buildApi(context: PeerAppContext) {
  const { workspace } = context;
  const { store } = workspace;

  return grout.createApi({
    getPollbookConfigurationInformation(): PollbookConfigurationInformation {
      assertPeerComponent(['poll-book']);
      return store.getPollbookConfigurationInformation();
    },

    getEvents(input: { lastEventSyncedPerNode: Record<string, number> }): {
      events: PollbookEvent[];
      configurationInformation: PollbookConfigurationInformation;
      hasMore: boolean;
    } {
      assertPeerComponent(['poll-book']);
      return {
        ...store.getNewEvents(input.lastEventSyncedPerNode),
        configurationInformation: store.getPollbookConfigurationInformation(),
      };
    },

    unconfigure() {
      assertPeerMachineId(context.machineId);
      pollNetworkForPollbookPackage(context);
    },

    async resetNetwork() {
      assertPeerMachineId(context.machineId);
      await resetNetworkSetup(context.machineId);
      store.clearConnectedPollbooks();
    },

    async configureFromPeerMachine(input: {
      machineId: string;
    }): Promise<Result<void, ConfigurationError>> {
      assertPeerMachineId(context.machineId);
      return await store.configureFromPeerMachine(
        workspace.assetDirectoryPath,
        input.machineId,
        context.peerTls.getAgent()
      );
    },
  });
}

export type PeerApi = ReturnType<typeof buildApi>;

export function buildPeerApp(context: PeerAppContext): Application {
  const app: Application = express();

  // Apply security headers middleware first
  app.use(securityHeadersMiddleware);
  app.use(
    buildPeerTlsIdentityMiddleware({
      logger: context.workspace.logger,
      logEventId: LogEventId.PollbookNetworkStatus,
    })
  );

  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));

  // Streaming endpoint for sending the pollbook package zip file to a peer
  app.get('/file/pollbook-package', (_req, res) => {
    try {
      assertPeerComponent(['poll-book']);
    } catch (error) {
      if (!(error instanceof PeerIdentityError)) {
        throw error;
      }
      res.status(403).send(error.message);
      return;
    }
    // Return a 404 if we are not configured
    if (!context.workspace.store.getElection()) {
      res.status(404).send('Pollbook package not found');
      return;
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

  setupMachineNetworking(context);
  fetchEventsFromConnectedPollbooks(context);
  pollNetworkForPollbookPackage(context);

  return app;
}
