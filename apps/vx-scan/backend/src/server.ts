import express, { Application, RequestHandler, response } from 'express';
import grout from '@votingworks/grout';

export interface Config {
  electionName: string;
  precinctName: string;
}

let store: { config: Config | undefined } = {
  config: {
    electionName: 'Election Name',
    precinctName: 'Precinct Name',
  },
};

const api = grout.createApi({
  getConfig: grout.query(async (): Promise<Config | undefined> => {
    return store.config;
  }),

  updateConfig: grout.mutation(async (newConfig: Config): Promise<void> => {
    store.config = newConfig;
  }),
});

export type VxScanApi = typeof api;

export async function start() {
  const app: Application = express();
  app.use(express.json());
  grout.express.registerRoutes(api, app);
  app.listen(3001);
}
