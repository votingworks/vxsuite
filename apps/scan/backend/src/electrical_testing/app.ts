import { createSystemCallApi } from '@votingworks/backend';
import { iter } from '@votingworks/basics';
import * as grout from '@votingworks/grout';
import { SheetOf } from '@votingworks/types';
import express, { Application } from 'express';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Player as AudioPlayer, SoundName } from '../audio/player';
import { getMachineConfig } from '../machine_config';
import type { ScanningMode, ServerContext } from './context';

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
      scannerTask.setState({ mode: input.mode });
    },

    async getLatestScannedSheet(): Promise<SheetOf<string> | null> {
      const usbDriveStatus = await usbDrive.status();
      const basedir =
        usbDriveStatus.status === 'mounted'
          ? join(usbDriveStatus.mountPoint, 'ballot-images')
          : workspace.ballotImagesPath;
      await mkdir(basedir, { recursive: true });
      const allFileNames = await readdir(basedir);
      const allScannedImageNames = allFileNames.filter((name) =>
        /^electrical-testing.*\.(jpe?g|png)$/.test(name)
      );
      const latestElectricalTestingImageName = iter(allScannedImageNames).max(
        (a, b) => a.localeCompare(b)
      );

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

export type Api = ReturnType<typeof buildApi>;

export function buildApp(context: ApiContext): Application {
  const app: Application = express();
  const api = buildApi(context);
  app.use('/api/images', async (req, res) => {
    const usbDriveStatus = await context.usbDrive.status();
    const basedir =
      usbDriveStatus.status === 'mounted'
        ? join(usbDriveStatus.mountPoint, 'ballot-images')
        : context.workspace.ballotImagesPath;

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
