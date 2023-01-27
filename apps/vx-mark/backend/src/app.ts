import * as grout from '@votingworks/grout';
import { ElectionDefinition } from '@votingworks/types';
import express, { Application } from 'express';
import { getMachineConfig } from './machine_config';
import { Workspace } from './util/workspace';

function buildApi(workspace: Workspace) {
  const { store } = workspace;

  return grout.createApi({
    getMachineConfig,

    saveElectionDefinition(input: {
      electionDefinition: ElectionDefinition;
    }): void {
      store.addElection(input.electionDefinition);
    },

    getElectionAndBallotForVoter(input: { voterId: string }): {
      electionDefinition: ElectionDefinition;
      ballotStyleId: string;
    } {
      const result = store.getElectionAndBallotStyleForVoter(input.voterId);
      if (!result) {
        throw new Error('no record for voter found');
      }
      const { electionId, ballotStyleId } = result;
      const electionDefinition = store.getElectionDefinition(electionId);
      return {
        electionDefinition,
        ballotStyleId,
      };
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(workspace: Workspace): Application {
  const app: Application = express();
  const api = buildApi(workspace);
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
