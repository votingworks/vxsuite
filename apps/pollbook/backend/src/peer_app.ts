import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { join } from 'node:path';
import fetch from 'node-fetch';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { err, ok, Result } from '@votingworks/basics';
import { debug } from 'node:console';
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
import { readPollbookPackage } from './pollbook_package';

function buildApi(context: PeerAppContext) {
  const { workspace, machineId } = context;
  const { store } = workspace;

  return grout.createApi({
    getMachineInformation(): MachineInformation {
      const pollbookInformation = store.getMachineInformation();
      if (!pollbookInformation) {
        return {
          machineId,
        };
      }
      return {
        ...pollbookInformation,
        machineId,
      };
    },

    getEvents(input: { lastEventSyncedPerNode: Record<string, number> }): {
      events: PollbookEvent[];
      hasMore: boolean;
    } {
      return store.getNewEvents(input.lastEventSyncedPerNode);
    },

    async configureFromMachine(input: {
      machineId: string;
    }): Promise<Result<void, ConfigurationError>> {
      // Find the connected pollbook with the given machineId
      const pollbooks = store.getPollbookServicesByName();
      const peer = Object.values(pollbooks).find(
        (pb) => pb.machineId === input.machineId && pb.apiClient
      );
      if (!peer || !peer.apiClient) {
        return err('pollbook-connection-problem');
      }
      // Get the peer's base URL (strip trailing /api if present)
      if (!peer.address) {
        return err('pollbook-connection-problem');
      }
      // Download the pollbook package zip via streaming
      const pollbookUrl = `${peer.address}/file/pollbook-package`;
      try {
        const response = await fetch(pollbookUrl);
        if (!response.ok) {
          return err('pollbook-connection-problem');
        }
        // Save to a temp file
        const tempPath = `${tmpdir()}/pollbook-package-${randomUUID()}.zip`;
        const fileStream = createWriteStream(tempPath);
        await pipeline(response.body, fileStream);
        // Read and parse the pollbook package
        const pollbookPackageResult = await readPollbookPackage(tempPath);
        if (pollbookPackageResult.isErr()) {
          return err('invalid-pollbook-package');
        }
        const pollbookPackage = pollbookPackageResult.ok();
        // Configure this machine
        store.setElectionAndVoters(
          pollbookPackage.electionDefinition,
          pollbookPackage.packageHash,
          pollbookPackage.validStreets,
          pollbookPackage.voters
        );
        // Save the pollbook package to send to other machines if necessary
        const destinationPath = join(
          context.workspace.assetDirectoryPath,
          'pollbook-package.zip'
        );
        await pipeline(
          createReadStream(tempPath),
          createWriteStream(destinationPath)
        );
        return ok();
      } catch (error) {
        debug(error);
        return err('pollbook-connection-problem');
      }
    },
  });
}

export type PeerApi = ReturnType<typeof buildApi>;

export function buildPeerApp(context: PeerAppContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));

  // Streaming endpoint for pollbook-package.zip
  app.get('/file/pollbook-package', (_req, res) => {
    try {
      const pollbookPackagePath = join(
        context.workspace.assetDirectoryPath,
        'pollbook-package.zip'
      );
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="pollbook-package.zip"'
      );
      res.sendFile(pollbookPackagePath, (e) => {
        if (e) {
          res.status(404).send('Pollbook package not found');
        }
      });
    } catch (error) {
      res.status(500).send('Error streaming pollbook package');
    }
  });

  void setupMachineNetworking(context);
  fetchEventsFromConnectedPollbooks(context);

  return app;
}
