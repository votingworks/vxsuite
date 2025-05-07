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
      cardTask: cardLoop,
      mockSimpleScannerClient,
      printerTask: printerLoop,
      scannerTask: scannerLoop,
      usbDriveTask: usbDriveLoop,
    },
    use
  ) => {
    const testingContext: ServerContext = {
      auth: appContext.mockAuth,
      cardTask: cardLoop,
      logger: appContext.logger,
      printer: wrapLegacyPrinter(appContext.mockPrinterHandler.printer),
      printerTask: printerLoop,
      usbDrive: appContext.mockUsbDrive.usbDrive,
      scannerClient: mockSimpleScannerClient,
      scannerTask: scannerLoop,
      usbDriveTask: usbDriveLoop,
      workspace: appContext.workspace,
    };

    await use(testingContext);
  },

  mockSimpleScannerClient: async ({}, use) => {
    const scannerClient = createMockSimpleScannerClient();
    await use(scannerClient);
  },

  cardTask: async ({}, use) => {
    const cardLoop = TaskController.started<string>();
    await use(cardLoop);
  },

  printerTask: async ({}, use) => {
    const printerLoop = TaskController.started<string>();
    await use(printerLoop);
  },

  scannerTask: async ({}, use) => {
    const scannerLoop = TaskController.started<string>();
    await use(scannerLoop);
  },

  usbDriveTask: async ({}, use) => {
    const usbDriveLoop = TaskController.started<string>();
    await use(usbDriveLoop);
  },
});
