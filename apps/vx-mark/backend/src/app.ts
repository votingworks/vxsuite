import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { getMachineConfig } from './machine_config';

function buildApi(
) {
  return grout.createApi({
    getMachineConfig,
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(): Application {
  const app: Application = express();
  const api = buildApi();
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
