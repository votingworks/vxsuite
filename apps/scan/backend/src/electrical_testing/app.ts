import { createSystemCallApi } from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import express, { Application } from 'express';
import { getMachineConfig } from '../machine_config';
import { ElectricalTestingComponent } from '../store';
import { type ServerContext } from './context';
import { TaskStatus } from './task_controller';

function buildApi({
  workspace,
  cardTask: cardLoop,
  usbDriveTask: usbDriveLoop,
  printerTask: printerLoop,
  scannerTask: scannerLoop,
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
          ? { ...cardMessage, taskStatus: cardLoop.getStatus() }
          : undefined,
        usbDrive: usbDriveMessage
          ? { ...usbDriveMessage, taskStatus: usbDriveLoop.getStatus() }
          : undefined,
        printer: printerMessage
          ? { ...printerMessage, taskStatus: printerLoop.getStatus() }
          : undefined,
        scanner: scannerMessage
          ? { ...scannerMessage, taskStatus: scannerLoop.getStatus() }
          : undefined,
      };
    },

    getTestTaskStatuses(): Record<ElectricalTestingComponent, TaskStatus> {
      return {
        card: cardLoop.getStatus(),
        usbDrive: usbDriveLoop.getStatus(),
        printer: printerLoop.getStatus(),
        scanner: scannerLoop.getStatus(),
      };
    },

    setCardReaderLoopRunning(input: { running: boolean }) {
      workspace.store.setElectricalTestingStatusMessage(
        'card',
        input.running ? 'Resumed' : 'Paused'
      );
      if (input.running) {
        cardLoop.resume();
      } else {
        cardLoop.pause();
      }
    },

    setUsbDriveLoopRunning(input: { running: boolean }) {
      workspace.store.setElectricalTestingStatusMessage(
        'usbDrive',
        input.running ? 'Resumed' : 'Paused'
      );
      if (input.running) {
        usbDriveLoop.resume();
      } else {
        usbDriveLoop.pause();
      }
    },

    setPrinterLoopRunning(input: { running: boolean }) {
      workspace.store.setElectricalTestingStatusMessage(
        'printer',
        input.running ? 'Resumed' : 'Paused'
      );
      if (input.running) {
        printerLoop.resume();
      } else {
        printerLoop.pause();
      }
    },

    setScannerLoopRunning(input: { running: boolean }) {
      workspace.store.setElectricalTestingStatusMessage(
        'scanner',
        input.running ? 'Resumed' : 'Paused'
      );
      if (input.running) {
        scannerLoop.resume();
      } else {
        scannerLoop.pause();
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
