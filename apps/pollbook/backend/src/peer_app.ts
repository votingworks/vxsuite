import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { MachineInformation, PollbookEvent, PeerAppContext } from './types';
import {
  fetchEventsFromConnectedPollbooks,
  setupMachineNetworking,
} from './networking';

function buildApi(context: PeerAppContext) {
  const { workspace, machineId } = context;
  const { store } = workspace;

  return grout.createApi({
    getMachineInformation(): MachineInformation {
      const election = store.getElection();
      return {
        machineId,
        configuredElectionId: election ? election.id : undefined,
      };
    },

    getEvents(input: { lastEventSyncedPerNode: Record<string, number> }): {
      events: PollbookEvent[];
      hasMore: boolean;
    } {
      return store.getNewEvents(input.lastEventSyncedPerNode);
    },
  });
}

export type PeerApi = ReturnType<typeof buildApi>;

export function buildPeerApp(context: PeerAppContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));

  void setupMachineNetworking(context);
  fetchEventsFromConnectedPollbooks(context);

  return app;
}
