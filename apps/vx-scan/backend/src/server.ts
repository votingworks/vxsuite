import express, { Application, RequestHandler, response } from 'express';
import { Api, createApi, mutationHandler, queryHandler } from './api-spec-lib';

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

const api = createApi({
  getConfig: queryHandler(async (): Promise<Config | undefined> => {
    return store.config;
  }),

  updateConfig: mutationHandler(async (newConfig: Config): Promise<void> => {
    store.config = newConfig;
  }),
});

export type ApiDefinition = typeof api;

export async function start() {
  const app: Application = express();
  app.use(express.json());
  api.registerRoutes(app);
  app.listen(3001);
}
