import { createImageData } from 'canvas';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { test } from '../../../test/helpers/test';
import {
  DELAY_AFTER_ACCEPT_MS,
  runPrintAndScanTask,
} from './print_and_scan_task';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_HARDWARE_TEST_APP
  );
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.ENABLE_HARDWARE_TEST_APP_INTERNAL_FUNCTIONS
  );
});

afterEach(() => {
  vi.useRealTimers();
});

test.electrical(
  'printAndScanLoop does not connect to the scanner when aborted',
  async ({ electricalAppContext, mockSimpleScannerClient }) => {
    // don't enter the main loop
    electricalAppContext.printerTask.stop();
    electricalAppContext.scannerTask.stop();

    await runPrintAndScanTask(electricalAppContext);

    expect(mockSimpleScannerClient.connect).not.toHaveBeenCalled();
    expect(
      mockSimpleScannerClient.ejectAndRescanPaperIfPresent
    ).not.toHaveBeenCalled();
    expect(mockSimpleScannerClient.disconnect).not.toHaveBeenCalled();
  }
);

test.electrical(
  'printAndScanLoop ejects paper to re-scan after a scan completes',
  async ({ mainAppContext, electricalAppContext, mockSimpleScannerClient }) => {
    mainAppContext.mockUsbDrive.insertUsbDrive({});
    mainAppContext.mockUsbDrive.usbDrive.status.reset();

    const loopPromise = runPrintAndScanTask(electricalAppContext);
    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.connect).toHaveBeenCalled();
    });
    const [onScannerEvent] = mockSimpleScannerClient.connect.mock.calls[0];

    onScannerEvent({
      event: 'scanComplete',
      images: [createImageData(1, 1), createImageData(1, 1)],
    });

    // Wait long enough that we eject the paper.
    await vi.advanceTimersByTimeAsync(DELAY_AFTER_ACCEPT_MS);

    await vi.waitFor(() => {
      expect(
        mockSimpleScannerClient.ejectAndRescanPaperIfPresent
      ).toHaveBeenCalledTimes(2);
    });

    // Exit the loop.
    electricalAppContext.printerTask.stop();
    electricalAppContext.scannerTask.stop();

    await loopPromise;
  }
);

test.electrical(
  'printAndScanLoop reconnects after a scanner error',
  async ({ electricalAppContext, mockSimpleScannerClient }) => {
    vi.useFakeTimers({
      shouldAdvanceTime: true,
    });
    const loopPromise = runPrintAndScanTask(electricalAppContext);
    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.connect).toHaveBeenCalled();
    });

    mockSimpleScannerClient.isConnected.mockReturnValue(true);

    const [onScannerEvent] = mockSimpleScannerClient.connect.mock.calls[0];

    onScannerEvent({
      event: 'error',
      code: 'scanFailed',
    });

    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.disconnect).toHaveBeenCalled();
    });

    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.connect).toHaveBeenCalled();
    });

    // Exit the loop.
    electricalAppContext.printerTask.stop();
    electricalAppContext.scannerTask.stop();

    await loopPromise;
  }
);
