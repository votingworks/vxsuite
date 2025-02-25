import { createImageData } from 'canvas';
import { expect, Mocked, test, vi } from 'vitest';
import { printAndScanLoop } from './background';
import { ElectricalTestingServerContext } from './server';
import { withApp } from '../../test/helpers/pdi_helpers';
import { wrapLegacyPrinter } from '../printing/printer';
import { delays } from '../scanners/pdi/state_machine';
import { SimpleScannerClient } from './simple_scanner_client';

function createMockSimpleScannerClient(): Mocked<SimpleScannerClient> {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    enableScanning: vi.fn(),
    ejectAndRescanPaperIfPresent: vi.fn(),
  };
}

const electricalTest = test.extend<{
  context: ElectricalTestingServerContext;
  mockSimpleScannerClient: Mocked<SimpleScannerClient>;
  // eslint-disable-next-line vitest/valid-title
}>({
  // eslint-disable-next-line no-empty-pattern
  mockSimpleScannerClient: async ({}, use) => {
    const scannerClient = createMockSimpleScannerClient();
    await use(scannerClient);
  },

  context: async ({ mockSimpleScannerClient }, use) => {
    await withApp(async (context) => {
      const controller = new AbortController();
      const testingContext: ElectricalTestingServerContext = {
        auth: context.mockAuth,
        logger: context.logger,
        printer: wrapLegacyPrinter(context.mockPrinterHandler.printer),
        usbDrive: context.mockUsbDrive.usbDrive,
        workspace: context.workspace,
        controller,
        scannerClient: mockSimpleScannerClient,
      };

      await use(testingContext);
    });
  },
});

electricalTest(
  'printAndScanLoop fails if scanner connection fails',
  async ({ context, mockSimpleScannerClient }) => {
    mockSimpleScannerClient.connect.mockRejectedValue(
      new Error('Scanner is not connected')
    );
    await expect(printAndScanLoop(context)).rejects.toThrow(
      'Scanner is not connected'
    );
  }
);

electricalTest(
  'printAndScanLoop fails if enabling scanner fails',
  async ({ context, mockSimpleScannerClient }) => {
    mockSimpleScannerClient.enableScanning.mockRejectedValue(
      new Error('Failed to enable scanner')
    );
    await expect(printAndScanLoop(context)).rejects.toThrow(
      'Failed to enable scanner'
    );
  }
);

electricalTest(
  'printAndScanLoop connects, ejects paper, and disconnects when aborted',
  async ({ context, mockSimpleScannerClient }) => {
    // don't enter the main loop
    context.controller.abort();

    await printAndScanLoop(context);

    expect(mockSimpleScannerClient.connect).toHaveBeenCalled();
    expect(
      mockSimpleScannerClient.ejectAndRescanPaperIfPresent
    ).toHaveBeenCalled();
    expect(mockSimpleScannerClient.disconnect).toHaveBeenCalled();
  }
);

electricalTest(
  'printAndScanLoop ejects paper to re-scan after a scan completes',
  async ({ context, mockSimpleScannerClient }) => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
    });
    const loopPromise = printAndScanLoop(context);
    const [onScannerEvent] = mockSimpleScannerClient.connect.mock.calls[0];

    onScannerEvent({
      event: 'scanComplete',
      images: [createImageData(1, 1), createImageData(1, 1)],
    });

    // wait long enough that we eject the paper
    await vi.advanceTimersByTimeAsync(
      delays.DELAY_ACCEPTED_READY_FOR_NEXT_BALLOT
    );

    await vi.waitFor(() => {
      expect(
        mockSimpleScannerClient.ejectAndRescanPaperIfPresent
      ).toHaveBeenCalledTimes(2);
    });

    // exit the loop
    context.controller.abort();

    await loopPromise;
  }
);

electricalTest(
  'printAndScanLoop reconnects after a scanner error',
  async ({ context, mockSimpleScannerClient }) => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
    });
    const loopPromise = printAndScanLoop(context);
    const [onScannerEvent] = mockSimpleScannerClient.connect.mock.calls[0];

    onScannerEvent({
      event: 'error',
      code: 'scanFailed',
    });

    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.reconnect).toHaveBeenCalled();
    });

    // exit the loop
    context.controller.abort();

    await loopPromise;
  }
);
