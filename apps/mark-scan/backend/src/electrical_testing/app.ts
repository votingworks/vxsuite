import { createSystemCallApi } from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { ServerContext } from './context';
import { getMachineConfig } from '../machine_config';

function buildApi({
  workspace,
  usbDrive,
  logger,
  cardTask,
  paperHandlerTask,
  usbDriveTask,
}: ServerContext) {
  const { store } = workspace;

  return grout.createApi({
    getElectricalTestingStatuses() {
      const messages = store.getElectricalTestingStatusMessages();
      const cardMessage = messages.find(
        (message) => message.component === 'card'
      );
      const paperHandlerMessage = messages.find(
        (message) => message.component === 'paperHandler'
      );
      const usbDriveMessage = messages.find(
        (message) => message.component === 'usbDrive'
      );
      return {
        card: cardMessage
          ? { ...cardMessage, taskStatus: cardTask.getStatus() }
          : undefined,
        paperHandler: paperHandlerMessage
          ? { ...paperHandlerMessage, taskStatus: paperHandlerTask.getStatus() }
          : undefined,
        usbDrive: usbDriveMessage
          ? { ...usbDriveMessage, taskStatus: usbDriveTask.getStatus() }
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

    setPaperHandlerTaskRunning(input: { running: boolean }) {
      workspace.store.setElectricalTestingStatusMessage(
        'paperHandler',
        input.running ? 'Resumed' : 'Paused'
      );
      if (input.running) {
        paperHandlerTask.resume();
      } else {
        paperHandlerTask.pause();
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
