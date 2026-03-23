import express, { Application } from 'express';
import {
  DippedSmartCardAuthApi,
  generateSignedHashValidationQrCodeValue,
} from '@votingworks/auth';
import * as grout from '@votingworks/grout';
import {
  assertDefined,
  err,
  ok,
  Result,
  throwIllegalValue,
} from '@votingworks/basics';
import { createSystemCallApi } from '@votingworks/backend';
import { Logger, LogEventId } from '@votingworks/logging';
import { isSystemAdministratorAuth } from '@votingworks/utils';
import { UsbDrive } from '@votingworks/usb-drive';
import { getMachineConfig } from './machine_config';
import { readMachineMode, writeMachineMode } from './machine_mode';
import {
  type MachineMode,
  ClientConnectionStatus,
  ElectionRecord,
} from './types';
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
  logger,
  usbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: ClientWorkspace;
  logger: Logger;
  usbDrive: UsbDrive;
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

    getCurrentElectionMetadata(): ElectionRecord | null {
      return clientStore.getCachedElectionRecord() ?? null;
    },

    getAdjudicationSessionStatus(): {
      isClientAdjudicationEnabled: boolean;
    } {
      return {
        isClientAdjudicationEnabled:
          clientStore.getIsClientAdjudicationEnabled(),
      };
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

    async getUsbDriveStatus() {
      return usbDrive.status();
    },

    async ejectUsbDrive() {
      return usbDrive.eject();
    },

    async formatUsbDrive(): Promise<Result<void, Error>> {
      const authStatus = await auth.getAuthStatus(
        constructAuthMachineState(clientStore)
      );
      if (!isSystemAdministratorAuth(authStatus)) {
        return err(
          new Error('Formatting USB drive requires system administrator auth.')
        );
      }
      try {
        await usbDrive.format();
        return ok();
      } catch (error) {
        return err(error as Error);
      }
    },

    /* istanbul ignore next - @preserve */
    async generateSignedHashValidationQrCodeValue() {
      const { codeVersion } = getMachineConfig();
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationInit);
      const electionRecord = clientStore.getCachedElectionRecord();
      const qrCodeValue = await generateSignedHashValidationQrCodeValue({
        electionRecord,
        softwareVersion: codeVersion,
      });
      await logger.logAsCurrentRole(LogEventId.SignedHashValidationComplete, {
        disposition: 'success',
      });
      return qrCodeValue;
    },

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
      workspacePath: workspace.path,
    }),
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
  usbDrive,
}: {
  auth: DippedSmartCardAuthApi;
  workspace: ClientWorkspace;
  logger: Logger;
  usbDrive: UsbDrive;
}): Application {
  const app: Application = express();
  const api = buildClientApi({ auth, workspace, logger, usbDrive });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
