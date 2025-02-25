import express, { Application } from 'express';
import * as grout from '@votingworks/grout';
import { type ServerContext } from './context';

function buildApi({ workspace, controller }: ServerContext) {
  const { store } = workspace;

  return grout.createApi({
    getElectricalTestingStatusMessages() {
      return store.getElectricalTestingStatusMessages();
    },

    stopElectricalTesting() {
      controller.abort('User requested testing be stopped');
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
