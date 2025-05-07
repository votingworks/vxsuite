import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { join } from 'node:path';
import fetch from 'node-fetch';
import { unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { err, ok, Result } from '@votingworks/basics';
import { rootDebug } from './debug';
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
import { POLLBOOK_PACKAGE_ASSET_FILE_NAME } from './globals';

const debug = rootDebug.extend('app:peer');

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

    async configureFromPeerMachine(input: {
      machineId: string;
    }): Promise<Result<void, ConfigurationError>> {
      // Find the connected pollbook with the given machineId
      const pollbooks = store.getPollbookServicesByName();
      const peer = Object.values(pollbooks).find(
        (pb) => pb.machineId === input.machineId && pb.apiClient
      );
      if (!peer || !peer.apiClient || !peer.address) {
        return err('pollbook-connection-problem');
      }
      // Download the pollbook package zip via streaming
      const pollbookUrl = `${peer.address}/file/pollbook-package`;
      const response = await fetch(pollbookUrl);
      if (!response.ok) {
        return err('pollbook-connection-problem');
      }
      // Save to a temp file
      const tempPath = `${tmpdir()}/pollbook-package-${randomUUID()}.zip`;
      try {
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
          POLLBOOK_PACKAGE_ASSET_FILE_NAME
        );
        await pipeline(
          createReadStream(tempPath),
          createWriteStream(destinationPath)
        );
        return ok();
      } finally {
        await unlink(tempPath).catch((error) => {
          debug(`Failed to delete temporary file at ${tempPath}:`, error);
        });
      }
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

  return app;
}
