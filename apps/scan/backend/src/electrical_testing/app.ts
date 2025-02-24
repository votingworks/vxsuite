import express, { Application } from 'express';
import * as grout from '@votingworks/grout';
import { ServerContext } from './context';

function buildApi({ workspace }: ServerContext) {
  const { store } = workspace;

  return grout.createApi({
    getElectricalTestingStatusMessages() {
      return store.getElectricalTestingStatusMessages();
    },
  });
}

export type ElectricalTestingApi = ReturnType<typeof buildApi>;

export function buildApp(context: ServerContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
