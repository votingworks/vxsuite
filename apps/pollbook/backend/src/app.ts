import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { sleep } from '@votingworks/basics';
import { Workspace } from './workspace';
import { Voter, VoterIdentificationMethod, VoterSearchParams } from './types';

function buildApi(workspace: Workspace) {
  const { store } = workspace;

  return grout.createApi({
    searchVoters(input: {
      searchParams: VoterSearchParams;
    }): Voter[] | number | null {
      const { searchParams } = input;
      if (Object.values(searchParams).every((value) => value === '')) {
        return null;
      }

      return store.searchVoters(searchParams);
    },

    async checkInVoter(input: {
      voterId: string;
      identificationMethod: VoterIdentificationMethod;
    }): Promise<boolean> {
      store.recordVoterCheckIn(input.voterId, input.identificationMethod);

      // TODO print voter receipt
      await sleep(2000);

      return true; // Successfully checked in and printed receipt
    },
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(workspace: Workspace): Application {
  const app: Application = express();
  const api = buildApi(workspace);
  app.use('/api', grout.buildRouter(api, express));
  app.use(express.static(workspace.assetDirectoryPath));
  return app;
}
