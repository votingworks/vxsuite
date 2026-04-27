import {
  createSystemCallApi,
  getCpuMetrics,
  CpuMetrics,
} from '@votingworks/backend';
import * as grout from '@votingworks/grout';
import { SignedHashValidationQrCodeValue } from '@votingworks/types';
import { generateSignedHashValidationQrCodeValue } from '@votingworks/auth';
import express, { Application } from 'express';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ServerContext } from './context';
import { getMachineConfig } from '../machine_config';

// Must match `PAT_CONSECUTIVE_STATUS_THRESHOLD_FILENAME` in the FAI 100
// controller daemon.
const PAT_CONSECUTIVE_STATUS_THRESHOLD_FILENAME =
  '_pat_consecutive_status_threshold';
const DEFAULT_PAT_CONSECUTIVE_STATUS_THRESHOLD = 3;

function buildApi({
  workspace,
  usbDrive,
  logger,
  cardTask,
  cardReaderErrorTracker,
  paperHandlerTask,
  usbDriveTask,
}: ServerContext) {
  const { store } = workspace;

  return grout.createApi({
    async getElectricalTestingStatuses() {
      cardReaderErrorTracker.assertHealthy();

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

    getMinTouchDurationMs(): number {
      return store.getMinTouchDurationMs();
    },

    setMinTouchDurationMs(input: { minTouchDurationMs: number }) {
      store.setMinTouchDurationMs(input.minTouchDurationMs);
    },

    getPatConsecutiveStatusThreshold(): number {
      const filePath = join(
        workspace.path,
        PAT_CONSECUTIVE_STATUS_THRESHOLD_FILENAME
      );
      if (!existsSync(filePath)) {
        return DEFAULT_PAT_CONSECUTIVE_STATUS_THRESHOLD;
      }
      const parsed = Number.parseInt(readFileSync(filePath, 'utf8').trim(), 10);
      return Number.isFinite(parsed)
        ? parsed
        : DEFAULT_PAT_CONSECUTIVE_STATUS_THRESHOLD;
    },

    setPatConsecutiveStatusThreshold(input: { threshold: number }) {
      writeFileSync(
        join(workspace.path, PAT_CONSECUTIVE_STATUS_THRESHOLD_FILENAME),
        String(input.threshold)
      );
    },

    async getCpuMetrics(): Promise<CpuMetrics> {
      return getCpuMetrics();
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
      workspacePath: workspace.path,
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
