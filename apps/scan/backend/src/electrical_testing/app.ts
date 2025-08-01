import { createSystemCallApi } from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import { mapSheet } from '@votingworks/types';
import express, { Application } from 'express';
import ws from 'express-ws';
import { basename, join } from 'node:path';
import { Player as AudioPlayer, SoundName } from '../audio/player';
import { getMachineConfig } from '../machine_config';
import type { ScanningMode, ServerContext } from './context';
import { ScanningSession, ScanningSessionData } from './analysis/scan';
import { ElectricalTestingComponent } from '../store';

type ApiContext = ServerContext & {
  audioPlayer?: AudioPlayer;
};

async function getElectricalTestingStatuses({
  workspace: { store },
  cardTask,
  printerTask,
  usbDriveTask,
  scannerTask,
  usbDrive,
}: ApiContext) {
  const messages = store.getElectricalTestingStatusMessages();
  const cardMessage = messages.find((message) => message.component === 'card');
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
}

function getCurrentScanningSessionData({
  scannerTask,
}: ServerContext): ScanningSessionData {
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
}

function buildApi(context: ApiContext) {
  const {
    audioPlayer,
    cardTask,
    usbDriveTask,
    printerTask,
    scannerTask,
    usbDrive,
    logger,
    setStatusMessage,
    onScanningSessionChanged,
  } = context;
  return grout.createApi({
    getElectricalTestingStatuses() {
      return getElectricalTestingStatuses(context);
    },

    async playSound(input: { name: SoundName }): Promise<void> {
      await audioPlayer?.play(input.name);
    },

    setCardReaderTaskRunning(input: { running: boolean }) {
      setStatusMessage('card', input.running ? 'Resumed' : 'Paused');
      if (input.running) {
        cardTask.resume();
      } else {
        cardTask.pause();
      }
    },

    setUsbDriveTaskRunning(input: { running: boolean }) {
      setStatusMessage('usbDrive', input.running ? 'Resumed' : 'Paused');
      if (input.running) {
        usbDriveTask.resume();
      } else {
        usbDriveTask.pause();
      }
    },

    setPrinterTaskRunning(input: { running: boolean }) {
      setStatusMessage('printer', input.running ? 'Resumed' : 'Paused');
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
      setStatusMessage('scanner', input.running ? 'Resumed' : 'Paused');
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
      onScanningSessionChanged();
    },

    getCurrentScanningSessionData(): ScanningSessionData {
      return getCurrentScanningSessionData(context);
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
  const { app } = ws(express());

  app.ws('/api/echo', (ws) => {
    ws.on('message', (msg) => {
      ws.send((msg as unknown as string).split('').reverse().join(''));
    });
  });

  app.ws('/api/events', async (ws) => {
    ws.on('message', (msg) => {
      console.warn('Ignoring message from client:', msg);
    });

    async function onStatusMessageChanged() {
      ws.send(
        grout.serialize({
          type: 'status-messages-changed',
          payload: await getElectricalTestingStatuses(context),
        })
      );
    }

    async function onSheetScanned() {
      ws.send(
        grout.serialize({
          type: 'scanning-session-changed',
          payload: getCurrentScanningSessionData(context),
        })
      );
    }

    context.eventBus.addListener(
      'status-messages-changed',
      onStatusMessageChanged
    );

    context.eventBus.addListener('sheet-scanned', onSheetScanned);

    ws.on('close', () => {
      context.eventBus.removeListener(
        'status-messages-changed',
        onStatusMessageChanged
      );
      context.eventBus.removeListener('sheet-scanned', onSheetScanned);
    });

    ws.send(
      grout.serialize({
        type: 'status-messages-changed',
        payload: await getElectricalTestingStatuses(context),
      })
    );
    ws.send(
      grout.serialize({
        type: 'scanning-session-changed',
        payload: getCurrentScanningSessionData(context),
      })
    );
  });

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
