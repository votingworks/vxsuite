import {
  createSystemCallApi,
  getCpuMetrics,
  CpuMetrics,
} from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import {
  PrinterStatus,
  SignedHashValidationQrCodeValue,
} from '@votingworks/types';
import { generateSignedHashValidationQrCodeValue } from '@votingworks/auth';
import * as hid from 'node-hid';
import express, { Application } from 'express';
import { ServerContext } from './context';
import { getMachineConfig } from '../machine_config';
import { sendTestPrint } from './background';
import { SoundName } from '../audio/player';

// Honeywell CM4680SR (AKA Metrologic Instruments CM4680SR):
const BARCODE_SCANNER_VENDOR_ID = 0x0c2e;
const BARCODE_SCANNER_PRODUCT_ID = 0x10d3;

/**
 * Check if the barcode scanner hardware is connected by looking for the USB device.
 */
function isBarcodeDeviceConnected(): boolean {
  const devices = hid.devices(
    BARCODE_SCANNER_VENDOR_ID,
    BARCODE_SCANNER_PRODUCT_ID
  );
  return devices.length > 0;
}

export interface BarcodeStatus {
  connected: boolean;
  lastScan?: {
    data: string;
    raw: string;
  };
  lastScanTimestamp?: Date;
}

function buildApi({
  audioPlayer,
  workspace,
  usbDrive,
  logger,
  cardTask,
  usbDriveTask,
  printer,
  printerTask,
  barcodeClient,
}: ServerContext) {
  const { store } = workspace;

  // Track barcode scanner state
  let lastBarcodeScan: { data: string; raw: string } | undefined;
  let lastBarcodeScanTimestamp: Date | undefined;

  if (barcodeClient) {
    barcodeClient.on('scan', (scanData: Uint8Array) => {
      // Decode the barcode data as UTF-8 text
      const raw = new TextDecoder().decode(scanData);
      lastBarcodeScan = {
        data: raw,
        raw,
      };
      lastBarcodeScanTimestamp = new Date();
    });
  }

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

    async getPrinterStatus(): Promise<PrinterStatus> {
      return printer.status();
    },

    getPrinterTaskStatus() {
      return {
        taskStatus: printerTask.getStatus(),
      };
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

    async printTestPage(): Promise<{ success: boolean; message: string }> {
      const result = await sendTestPrint(printer);
      workspace.store.setElectricalTestingStatusMessage(
        'printer',
        result.message
      );
      return result;
    },

    getBarcodeStatus(): BarcodeStatus {
      return {
        connected: isBarcodeDeviceConnected(),
        lastScan: lastBarcodeScan,
        lastScanTimestamp: lastBarcodeScanTimestamp,
      };
    },

    async playSpeakerSound(input: { name: SoundName }): Promise<void> {
      await audioPlayer?.play(input.name);
    },

    async generateSignedHashValidationQrCodeValue(): Promise<SignedHashValidationQrCodeValue> {
      const qrCodeValue = await generateSignedHashValidationQrCodeValue({
        electionRecord: undefined,
        softwareVersion: getMachineConfig().codeVersion,
      });
      return qrCodeValue;
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
