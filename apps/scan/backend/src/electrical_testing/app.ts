import { createSystemCallApi } from '@votingworks/backend';
import { iter } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import { SheetOf } from '@votingworks/types';
import express, { Application } from 'express';
import { readdir } from 'node:fs/promises';
import { getMachineConfig } from '../machine_config';
import { ElectricalTestingComponent } from '../store';
import { type ServerContext } from './context';
import { TaskStatus } from './task_controller';

function buildApi({
  workspace,
  cardTask,
  usbDriveTask,
  printerTask,
  scannerTask,
  usbDrive,
  logger,
}: ServerContext) {
  const { store } = workspace;

  return grout.createApi({
    getElectricalTestingStatuses() {
      const messages = store.getElectricalTestingStatusMessages();
      const cardMessage = messages.find(
        (message) => message.component === 'card'
      );
      const usbDriveMessage = messages.find(
        (message) => message.component === 'usbDrive'
      );
      const printerMessage = messages.find(
        (message) => message.component === 'printer'
      );
      const scannerMessage = messages.find(
        (message) => message.component === 'scanner'
      );
      return {
        card: cardMessage
          ? { ...cardMessage, taskStatus: cardTask.getStatus() }
          : undefined,
        usbDrive: usbDriveMessage
          ? { ...usbDriveMessage, taskStatus: usbDriveTask.getStatus() }
          : undefined,
        printer: printerMessage
          ? { ...printerMessage, taskStatus: printerTask.getStatus() }
          : undefined,
        scanner: scannerMessage
          ? { ...scannerMessage, taskStatus: scannerTask.getStatus() }
          : undefined,
      };
    },

    getTestTaskStatuses(): Record<ElectricalTestingComponent, TaskStatus> {
      return {
        card: cardTask.getStatus(),
        usbDrive: usbDriveTask.getStatus(),
        printer: printerTask.getStatus(),
        scanner: scannerTask.getStatus(),
      };
    },

    setCardReaderLoopRunning(input: { running: boolean }) {
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

    setUsbDriveLoopRunning(input: { running: boolean }) {
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

    setPrinterLoopRunning(input: { running: boolean }) {
      workspace.store.setElectricalTestingStatusMessage(
        'printer',
        input.running ? 'Resumed' : 'Paused'
      );
      if (input.running) {
        printerTask.resume();
      } else {
        printerTask.pause();
      }
    },

    setScannerLoopRunning(input: { running: boolean }) {
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        input.running ? 'Resumed' : 'Paused'
      );
      if (input.running) {
        scannerTask.resume();
      } else {
        scannerTask.pause();
      }
    },

    async getLatestScannedSheet(): Promise<SheetOf<string> | null> {
      const allScannedImageNames = await readdir(workspace.ballotImagesPath);
      const latestElectricalTestingImageName = iter(allScannedImageNames)
        .filter((name) => name.startsWith('electrical-testing-'))
        .max((a, b) => a.localeCompare(b));

      if (!latestElectricalTestingImageName) {
        return null;
      }

      const id = latestElectricalTestingImageName.replace(
        /-(front|back)\.(jpe?g|png)$/,
        ''
      );
      const frontAndBackNames = allScannedImageNames.filter((name) =>
        name.startsWith(id)
      );
      if (frontAndBackNames.length !== 2) {
        return null;
      }

      const frontName = frontAndBackNames.find((name) => /-front\./.test(name));
      const backName = frontAndBackNames.find((name) => /-back\./.test(name));

      if (!frontName || !backName) {
        return null;
      }

      return [`/api/images/${frontName}`, `/api/images/${backName}`];
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
  app.use('/api/images', express.static(context.workspace.ballotImagesPath));
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
