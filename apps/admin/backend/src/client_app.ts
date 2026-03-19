import express, { Application } from 'express';
import { DippedSmartCardAuthApi } from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import { assertDefined, throwIllegalValue } from '@votingworks/basics';
import { Logger } from '@votingworks/logging';
import { getMachineConfig } from './machine_config';
import { readMachineMode, writeMachineMode } from './machine_mode';
import { type MachineMode, ClientConnectionStatus } from './types';
import { type ClientWorkspace } from './util/workspace';
import { constructAuthMachineState } from './util/auth';

/**
 * Network connection status as returned to the frontend.
 */
export type NetworkConnectionStatus =
  | { status: 'offline' }
  | { status: 'online-waiting-for-host' }
  | { status: 'online-connected-to-host'; hostMachineId: string };

function buildClientApi({
  auth,
  workspace,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: ClientWorkspace;
  logger: Logger;
}) {
  const { clientStore } = workspace;
  return grout.createApi({
    getMachineConfig,

    getMachineMode(): MachineMode {
      return readMachineMode(workspace.path);
    },

    setMachineMode(input: { mode: MachineMode }) {
      writeMachineMode(workspace.path, input.mode);
    },

    getNetworkConnectionStatus(): NetworkConnectionStatus {
      const status = clientStore.getConnectionStatus();
      switch (status) {
        case ClientConnectionStatus.Offline:
          return { status: 'offline' };
        case ClientConnectionStatus.OnlineWaitingForHost:
          return { status: 'online-waiting-for-host' };
        case ClientConnectionStatus.OnlineConnectedToHost: {
          const hostConnection = assertDefined(clientStore.getHostConnection());
          return {
            status: 'online-connected-to-host',
            hostMachineId: hostConnection.machineId,
          };
        }
        /* istanbul ignore next - @preserve */
        default:
          throwIllegalValue(status);
      }
    },

    getAuthStatus() {
      return auth.getAuthStatus(constructAuthMachineState(clientStore));
    },

    checkPin(input: { pin: string }) {
      return auth.checkPin(constructAuthMachineState(clientStore), input);
    },

    logOut() {
      return auth.logOut(constructAuthMachineState(clientStore));
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
}: {
  auth: DippedSmartCardAuthApi;
  workspace: ClientWorkspace;
  logger: Logger;
}): Application {
  const app: Application = express();
  const api = buildClientApi({ auth, workspace, logger });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
