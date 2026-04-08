import { createImageData } from 'canvas';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { test } from '../../../test/helpers/test';
import {
  DELAY_AFTER_ACCEPT_MS,
  DELAY_AFTER_SCANNER_ERROR_MS,
  LOOP_INTERVAL_MS,
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

test.electrical(
  'printAndScanLoop sets status message after successful eject',
  async ({ electricalAppContext, mockSimpleScannerClient }) => {
    mockSimpleScannerClient.ejectAndRescanPaperIfPresent.mockResolvedValue(
      true
    );

    const loopPromise = runPrintAndScanTask(electricalAppContext);
    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.connect).toHaveBeenCalled();
    });
    const [onScannerEvent] = mockSimpleScannerClient.connect.mock.calls[0];

    onScannerEvent({
      event: 'scanComplete',
      images: [createImageData(1, 1), createImageData(1, 1)],
    });

    await vi.advanceTimersByTimeAsync(DELAY_AFTER_ACCEPT_MS);

    await vi.waitFor(() => {
      expect(
        mockSimpleScannerClient.ejectAndRescanPaperIfPresent
      ).toHaveBeenCalledTimes(2);
    });

    // isFrontSensorCovered should not be called when eject succeeds.
    expect(mockSimpleScannerClient.isFrontSensorCovered).not.toHaveBeenCalled();

    electricalAppContext.printerTask.stop();
    electricalAppContext.scannerTask.stop();
    await loopPromise;
  }
);

test.electrical(
  'printAndScanLoop handles analysis failure gracefully',
  async ({ electricalAppContext, mockSimpleScannerClient }) => {
    const loopPromise = runPrintAndScanTask(electricalAppContext);
    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.connect).toHaveBeenCalled();
    });
    const [onScannerEvent] = mockSimpleScannerClient.connect.mock.calls[0];

    // A 1x1 image will fail timing mark detection, exercising the
    // analysis try/catch path. The task should continue without crashing.
    onScannerEvent({
      event: 'scanComplete',
      images: [createImageData(1, 1), createImageData(1, 1)],
    });

    await vi.advanceTimersByTimeAsync(DELAY_AFTER_ACCEPT_MS);

    // The session should still have the sheet even though analysis failed.
    const { session } = electricalAppContext.scannerTask.getState();
    const sessionData = session.toJSON();
    expect(sessionData.sheets).toHaveLength(1);
    expect(sessionData.sheets[0][0].analysis).toBeUndefined();
    expect(sessionData.sheets[0][1].analysis).toBeUndefined();
    expect(sessionData.stats).toBeUndefined();

    electricalAppContext.printerTask.stop();
    electricalAppContext.scannerTask.stop();
    await loopPromise;
  }
);

test.electrical(
  'printAndScanLoop resets scanning when paper is at front sensor only',
  async ({ electricalAppContext, mockSimpleScannerClient }) => {
    mockSimpleScannerClient.ejectAndRescanPaperIfPresent.mockResolvedValue(
      false
    );
    mockSimpleScannerClient.isFrontSensorCovered.mockResolvedValue(true);

    const loopPromise = runPrintAndScanTask(electricalAppContext);
    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.connect).toHaveBeenCalled();
    });
    const [onScannerEvent] = mockSimpleScannerClient.connect.mock.calls[0];

    onScannerEvent({
      event: 'scanComplete',
      images: [createImageData(1, 1), createImageData(1, 1)],
    });

    await vi.advanceTimersByTimeAsync(DELAY_AFTER_ACCEPT_MS);

    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.isFrontSensorCovered).toHaveBeenCalled();
    });

    // Front sensor covered should trigger a reconnect cycle.
    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.connect).toHaveBeenCalledTimes(2);
    });

    electricalAppContext.printerTask.stop();
    electricalAppContext.scannerTask.stop();
    await loopPromise;
  }
);

test.electrical(
  'printAndScanLoop handles eject error gracefully',
  async ({ electricalAppContext, mockSimpleScannerClient }) => {
    const loopPromise = runPrintAndScanTask(electricalAppContext);
    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.connect).toHaveBeenCalled();
    });
    const [onScannerEvent] = mockSimpleScannerClient.connect.mock.calls[0];

    onScannerEvent({
      event: 'scanComplete',
      images: [createImageData(1, 1), createImageData(1, 1)],
    });

    // Wait for the scan event to be processed, then set up the eject failure
    // for the main loop's eject call.
    await vi.advanceTimersByTimeAsync(LOOP_INTERVAL_MS);
    mockSimpleScannerClient.ejectAndRescanPaperIfPresent.mockRejectedValueOnce(
      new Error('scanner communication error')
    );

    await vi.advanceTimersByTimeAsync(DELAY_AFTER_ACCEPT_MS);

    // Wait for the error cooldown before the reconnect happens.
    await vi.advanceTimersByTimeAsync(DELAY_AFTER_SCANNER_ERROR_MS);

    // The error should trigger a reconnect cycle rather than crashing.
    await vi.waitFor(() => {
      expect(mockSimpleScannerClient.connect).toHaveBeenCalledTimes(2);
    });

    electricalAppContext.printerTask.stop();
    electricalAppContext.scannerTask.stop();
    await loopPromise;
  }
);
