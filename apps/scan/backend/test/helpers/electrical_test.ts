/* eslint-disable no-empty-pattern */
import { TaskController } from '@votingworks/backend';
import { Mocked, test, vi } from 'vitest';
import { ServerContext } from '../../src/electrical_testing/context';
import { SimpleScannerClient } from '../../src/electrical_testing/simple_scanner_client';
import { wrapLegacyPrinter } from '../../src/printing/printer';
import { AppContext, withApp } from './pdi_helpers';

function createMockSimpleScannerClient(): Mocked<SimpleScannerClient> {
  return {
    isConnected: vi.fn().mockReturnValue(false),
    connect: vi.fn(),
    disconnect: vi.fn(),
    enableScanning: vi.fn(),
    ejectAndRescanPaperIfPresent: vi.fn(),
  };
}

export const electricalTest = test.extend<{
  mainAppContext: AppContext;
  electricalAppContext: ServerContext;
  mockSimpleScannerClient: Mocked<SimpleScannerClient>;
  cardTask: TaskController<string>;
  printerTask: TaskController<string>;
  scannerTask: TaskController<string>;
  usbDriveTask: TaskController<string>;
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
    const cardTask = TaskController.started<string>();
    await use(cardTask);
  },

  printerTask: async ({}, use) => {
    const printerTask = TaskController.started<string>();
    await use(printerTask);
  },

  scannerTask: async ({}, use) => {
    const scannerTask = TaskController.started<string>();
    await use(scannerTask);
  },

  usbDriveTask: async ({}, use) => {
    const usbDriveTask = TaskController.started<string>();
    await use(usbDriveTask);
  },
});
