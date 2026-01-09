import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { Logger, LogEventId } from '@votingworks/logging';
import { DiagnosticRecord } from '@votingworks/types';
import { Server } from 'node:http';
import * as grout from '@votingworks/grout';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { getDiskSpaceSummary, DiskSpaceSummary } from '@votingworks/backend';
import {
  HP_LASER_PRINTER_CONFIG,
  MemoryPrinterHandler,
} from '@votingworks/printing';
import { createApp } from '../test/app_helpers';
import { Api } from './app';
import { MockBarcodeClient } from './barcodes/mock_client';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

vi.mock(import('./util/accessible_controller.js'), async (importActual) => ({
  ...(await importActual()),
  isAccessibleControllerAttached: vi.fn().mockReturnValue(true),
  isPatInputAttached: vi.fn().mockReturnValue(true),
}));

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  getDiskSpaceSummary: vi.fn(),
}));

const MOCK_DISK_SPACE_SUMMARY: DiskSpaceSummary = {
  total: 10 * 1_000_000,
  used: 1 * 1_000_000,
  available: 9 * 1_000_000,
};

let apiClient: grout.Client<Api>;
let logger: Logger;
let mockUsbDrive: MockUsbDrive;
let mockPrinterHandler: MemoryPrinterHandler;
let server: Server;
let mockBarcodeClient: MockBarcodeClient;

const mockTime = new Date('2021-01-01T00:00:00.000');

async function wrapWithFakeSystemTime<T>(fn: () => Promise<T>): Promise<T> {
  vi.useFakeTimers().setSystemTime(mockTime.getTime());
  const result = await fn();
  vi.useRealTimers();
  return result;
}

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  vi.mocked(getDiskSpaceSummary).mockResolvedValue(MOCK_DISK_SPACE_SUMMARY);

  ({
    apiClient,
    mockUsbDrive,
    mockBarcodeClient,
    mockPrinterHandler,
    server,
    logger,
  } = createApp());
});

afterEach(() => {
  server?.close();
});

test('getDiskSpaceSummary', async () => {
  const result = await apiClient.getDiskSpaceSummary();
  expect(result).toEqual(MOCK_DISK_SPACE_SUMMARY);
});

test('getMostRecentDiagnostic returns null when no record exists', async () => {
  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'uninterruptible-power-supply',
    })
  ).toBeNull();
});

test('addDiagnosticRecord and getMostRecentDiagnostic', async () => {
  await wrapWithFakeSystemTime(async () => {
    await apiClient.addDiagnosticRecord({
      type: 'mark-pat-input',
      outcome: 'pass',
    });
  });

  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'mark-pat-input',
    })
  ).toEqual<DiagnosticRecord>({
    type: 'mark-pat-input',
    outcome: 'pass',
    timestamp: mockTime.getTime(),
  });
});

test('addDiagnosticRecord logs the outcome', async () => {
  await apiClient.addDiagnosticRecord({
    type: 'mark-headphone-input',
    outcome: 'fail',
    message: 'Test failure message',
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.DiagnosticComplete,
    {
      disposition: 'failure',
      message:
        'Diagnostic (mark-headphone-input) completed with outcome: fail.',
      type: 'mark-headphone-input',
    }
  );
});

test('logUpsDiagnosticOutcome pass', async () => {
  await wrapWithFakeSystemTime(async () => {
    await apiClient.logUpsDiagnosticOutcome({ outcome: 'pass' });
  });

  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'uninterruptible-power-supply',
    })
  ).toEqual<DiagnosticRecord>({
    type: 'uninterruptible-power-supply',
    outcome: 'pass',
    message: 'UPS connected and fully charged per user.',
    timestamp: mockTime.getTime(),
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.DiagnosticComplete,
    {
      disposition: 'success',
      message: 'UPS connected and fully charged per user.',
      type: 'uninterruptible-power-supply',
    }
  );
});

test('logUpsDiagnosticOutcome fail', async () => {
  await wrapWithFakeSystemTime(async () => {
    await apiClient.logUpsDiagnosticOutcome({ outcome: 'fail' });
  });

  expect(
    await apiClient.getMostRecentDiagnostic({
      diagnosticType: 'uninterruptible-power-supply',
    })
  ).toEqual<DiagnosticRecord>({
    type: 'uninterruptible-power-supply',
    outcome: 'fail',
    message: 'UPS not connected or not fully charged per user.',
    timestamp: mockTime.getTime(),
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.DiagnosticComplete,
    {
      disposition: 'failure',
      message: 'UPS not connected or not fully charged per user.',
      type: 'uninterruptible-power-supply',
    }
  );
});

test('printTestPage prints and logs', async () => {
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  await apiClient.printTestPage();

  await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'mark-print-test-page',
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.DiagnosticInit,
    {
      disposition: 'success',
      message: 'User started a print diagnostic by printing a test page.',
    }
  );
});

test('saveReadinessReport success', async () => {
  mockUsbDrive.insertUsbDrive({});
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();

  const result = await apiClient.saveReadinessReport();
  result.assertOk('Failed to save readiness report');

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ReadinessReportSaved,
    {
      disposition: 'success',
      message: 'User saved the equipment readiness report to a USB drive.',
    }
  );

  const exportPath = result.ok()![0];
  await expect(exportPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'mark-readiness-report',
  });
});

test('saveReadinessReport failure logs error', async () => {
  // Don't insert USB drive to cause failure
  mockUsbDrive.removeUsbDrive();

  const result = await apiClient.saveReadinessReport();
  expect(result.err()).toEqual({
    message: 'No USB drive found',
    type: 'missing-usb-drive',
  });

  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ReadinessReportSaved,
    expect.objectContaining({
      disposition: 'failure',
    })
  );
});

test('getMostRecentBarcodeScan returns null initially', async () => {
  expect(await apiClient.getMostRecentBarcodeScan()).toBeNull();
});

test('getMostRecentBarcodeScan returns scan data after scan', async () => {
  // Simulate a barcode scan
  // eslint-disable-next-line no-restricted-globals
  mockBarcodeClient.emitScan(Buffer.from('test-barcode-data'));

  const result = await apiClient.getMostRecentBarcodeScan();
  expect(result).not.toBeNull();
  expect(result?.data).toEqual('test-barcode-data');
  expect(result?.timestamp).toBeInstanceOf(Date);
});

test('clearLastBarcodeScan clears the scan data', async () => {
  // Simulate a barcode scan
  // eslint-disable-next-line no-restricted-globals
  mockBarcodeClient.emitScan(Buffer.from('test-barcode-data'));

  // Verify scan data exists
  expect(await apiClient.getMostRecentBarcodeScan()).not.toBeNull();

  // Clear it
  await apiClient.clearLastBarcodeScan();

  // Verify it's cleared
  expect(await apiClient.getMostRecentBarcodeScan()).toBeNull();
});
