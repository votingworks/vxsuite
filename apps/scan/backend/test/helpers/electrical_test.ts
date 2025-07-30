/* eslint-disable no-empty-pattern */
import { TaskController } from '@votingworks/backend';
import { DateTime } from 'luxon';
import { Mocked, test, vi } from 'vitest';
import {
  ScanningMode,
  ServerContext,
} from '../../src/electrical_testing/context';
import { SimpleScannerClient } from '../../src/electrical_testing/simple_scanner_client';
import { wrapLegacyPrinter } from '../../src/printing/printer';
import { AppContext, withApp } from './pdi_helpers';

function createMockSimpleScannerClient(): Mocked<SimpleScannerClient> {
  return {
    isConnected: vi.fn().mockReturnValue(false),
    connect: vi.fn(),
    disconnect: vi.fn(),
    enableScanning: vi.fn(),
    disableScanning: vi.fn(),
    ejectPaper: vi.fn(),
    ejectAndRescanPaperIfPresent: vi.fn(),
  };
}

export const electricalTest = test.extend<{
  mainAppContext: AppContext;
  electricalAppContext: ServerContext;
  mockSimpleScannerClient: Mocked<SimpleScannerClient>;
  cardTask: TaskController<void, string>;
  printerTask: TaskController<{ lastPrintedAt?: DateTime }, string>;
  scannerTask: TaskController<{ mode: ScanningMode }, string>;
  usbDriveTask: TaskController<void, string>;
}>({
  mainAppContext: async ({}, use) => {
    await withApp(async (context) => {
      await use(context);
    });
  },

  electricalAppContext: async (
    {
      mainAppContext: appContext,
      cardTask,
      mockSimpleScannerClient,
      printerTask,
      scannerTask,
      usbDriveTask,
    },
    use
  ) => {
    const testingContext: ServerContext = {
      auth: appContext.mockAuth,
      cardTask,
      logger: appContext.logger,
      printer: wrapLegacyPrinter(appContext.mockPrinterHandler.printer),
      printerTask,
      usbDrive: appContext.mockUsbDrive.usbDrive,
      scannerClient: mockSimpleScannerClient,
      scannerTask,
      usbDriveTask,
      workspace: appContext.workspace,
    };

    await use(testingContext);
  },

  mockSimpleScannerClient: async ({}, use) => {
    const scannerClient = createMockSimpleScannerClient();
    await use(scannerClient);
  },

  cardTask: async ({}, use) => {
    await use(TaskController.started());
  },

  printerTask: async ({}, use) => {
    await use(TaskController.started({ lastPrintedAt: undefined }));
  },

  scannerTask: async ({}, use) => {
    await use(TaskController.started({ mode: 'shoe-shine' }));
  },

  usbDriveTask: async ({}, use) => {
    await use(TaskController.started());
  },
});
