/* istanbul ignore file - @preserve */
import {
  createSystemCallApi,
  getCpuMetrics,
  CpuMetrics,
} from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { ServerContext } from './context';
import { getMachineConfig } from '../machine_config';

function buildApi({
  workspace,
  usbDrive,
  logger,
  cardTask,
  usbDriveTask,
}: ServerContext) {
  const { store } = workspace;

  return grout.createApi({
    async getElectricalTestingStatuses() {
      const messages = store.getElectricalTestingStatusMessages();
      const cardMessage = messages.find(
        (message) => message.component === 'card'
      );
      const usbDriveMessage = messages.find(
        (message) => message.component === 'usbDrive'
      );
      return {
        card: cardMessage
          ? { ...cardMessage, taskStatus: cardTask.getStatus() }
          : undefined,
        usbDrive: usbDriveMessage
          ? {
              ...usbDriveMessage,
              taskStatus: usbDriveTask.getStatus(),
              underlyingDeviceStatus: await usbDrive.status(),
            }
          : undefined,
      };
    },

    setCardReaderTaskRunning(input: { running: boolean }) {
      workspace.store.setElectricalTestingStatusMessage(
        'card',
        input.running ? 'Resumed' : 'Paused'
      );
      if (input.running) {
        cardTask.resume();
      } else {
        cardTask.pause();
      }
    },

    setUsbDriveTaskRunning(input: { running: boolean }) {
      workspace.store.setElectricalTestingStatusMessage(
        'usbDrive',
        input.running ? 'Resumed' : 'Paused'
      );
      if (input.running) {
        usbDriveTask.resume();
      } else {
        usbDriveTask.pause();
      }
    },

    async getCpuMetrics(): Promise<CpuMetrics> {
      return getCpuMetrics();
    },

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
    }),
  });
}

export type ElectricalTestingApi = ReturnType<typeof buildApi>;

export function buildApp(context: ServerContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
