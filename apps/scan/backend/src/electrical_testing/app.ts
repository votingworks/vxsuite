import { createSystemCallApi } from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import { mapSheet } from '@votingworks/types';
import express, { Application } from 'express';
import { basename, join } from 'node:path';
import { Player as AudioPlayer, SoundName } from '../audio/player';
import { getMachineConfig } from '../machine_config';
import type { ScanningMode, ServerContext } from './context';
import { ScanningSession, ScanningSessionData } from './analysis/scan';

type ApiContext = ServerContext & {
  audioPlayer?: AudioPlayer;
};

function buildApi({
  audioPlayer,
  workspace,
  cardTask,
  usbDriveTask,
  printerTask,
  scannerTask,
  usbDrive,
  logger,
}: ApiContext) {
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
          ? {
              ...usbDriveMessage,
              taskStatus: usbDriveTask.getStatus(),
              underlyingDeviceStatus: await usbDrive.status(),
            }
          : undefined,
        printer: printerMessage
          ? { ...printerMessage, taskStatus: printerTask.getStatus() }
          : undefined,
        scanner: scannerMessage
          ? {
              ...scannerMessage,
              taskStatus: scannerTask.getStatus(),
              mode: scannerTask.getState().mode,
            }
          : undefined,
      };
    },

    async playSound(input: { name: SoundName }): Promise<void> {
      await audioPlayer?.play(input.name);
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

    setPrinterTaskRunning(input: { running: boolean }) {
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

    resetLastPrintedAt(): void {
      printerTask.setState({ lastPrintedAt: undefined });
    },

    setScannerTaskRunning(input: { running: boolean }) {
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

    setScannerTaskMode(input: { mode: ScanningMode }): void {
      const { session } = scannerTask.getState();
      scannerTask.setState({ mode: input.mode, session });
    },

    resetScanningSession(): void {
      const { mode } = scannerTask.getState();
      scannerTask.setState({ mode, session: new ScanningSession() });
    },

    getCurrentScanningSessionData(): ScanningSessionData {
      const { sheets, stats } = scannerTask.getState().session.toJSON();
      return {
        sheets: sheets.map((sheet) =>
          mapSheet(sheet, ({ path, analysis }) => ({
            path: `/api/images/${basename(path)}`,
            analysis,
          }))
        ),
        stats,
      };
    },

    ...createSystemCallApi({
      usbDrive,
      logger,
      machineId: getMachineConfig().machineId,
      codeVersion: getMachineConfig().codeVersion,
    }),
  });
}

export type Api = ReturnType<typeof buildApi>;

export function buildApp(context: ApiContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api/images', (req, res) => {
    const basedir = context.workspace.ballotImagesPath;
    const path = join(basedir, req.path);
    if (!path.startsWith(basedir)) {
      res.status(404).send('Not Found');
      return;
    }

    res.sendFile(path);
  });
  app.use('/api', grout.buildRouter(api, express));
  return app;
}
