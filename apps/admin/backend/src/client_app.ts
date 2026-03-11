import express, { Application } from 'express';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { Logger } from '@votingworks/logging';
import { getMachineConfig } from './machine_config';
import { readMachineMode, writeMachineMode } from './machine_mode';
import { type MachineMode } from './types';
import { type NetworkConnectionStatus } from './networking';
import { type Workspace } from './util/workspace';
import { constructAuthMachineState } from './util/auth';

function buildClientApi({
  auth,
  workspace,
  getNetworkConnectionStatus,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  getNetworkConnectionStatus: () => NetworkConnectionStatus;
}) {
  return grout.createApi({
    getMachineConfig,

    getMachineMode(): MachineMode {
      return readMachineMode(workspace.path);
    },

    setMachineMode(input: { mode: MachineMode }) {
      writeMachineMode(workspace.path, input.mode);
    },

    getNetworkConnectionStatus(): NetworkConnectionStatus {
      return getNetworkConnectionStatus();
    },

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(workspace));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(workspace), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(workspace));
    },
  });
}

/**
 * A type to be used by the frontend to create a Grout API client for client
 * mode.
 */
export type ClientApi = ReturnType<typeof buildClientApi>;

/**
 * Builds an express application for client mode.
 */
export function buildClientApp({
  auth,
  workspace,
  logger,
  getNetworkConnectionStatus = () => ({ status: 'offline' as const }),
}: {
  auth: DippedSmartCardAuthApi;
  workspace: Workspace;
  logger: Logger;
  getNetworkConnectionStatus?: () => NetworkConnectionStatus;
}): Application {
  const app: Application = express();
  const api = buildClientApi({
    auth,
    workspace,
    logger,
    getNetworkConnectionStatus,
  });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
