import { beforeEach, expect, test, vi } from 'vitest';
import { LogEventId } from '@votingworks/logging';
import { HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import {
  DiskSpaceSummary,
  getBatteryInfo,
  getDiskSpaceSummary,
  pdfToText,
} from '@votingworks/backend';
import { DiagnosticRecord } from '@votingworks/types';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  buildTestEnvironment,
  configureMachine,
  mockSystemAdministratorAuth,
} from '../test/app';

vi.setConfig({
  testTimeout: 60_000,
});

vi.mock(
  import('@votingworks/backend'),
  async (importActual): Promise<typeof import('@votingworks/backend')> => ({
    ...(await importActual()),
    getBatteryInfo: vi.fn(),
    getDiskSpaceSummary: vi.fn(),
  })
);

const MOCK_DISK_SPACE_SUMMARY: DiskSpaceSummary = {
  total: 10 * 1_000_000,
  used: 1 * 1_000_000,
  available: 9 * 1_000_000,
};

beforeEach(() => {
  vi.mocked(getBatteryInfo).mockResolvedValue({
    level: 0.5,
    discharging: false,
  });
  vi.mocked(getDiskSpaceSummary).mockResolvedValue(MOCK_DISK_SPACE_SUMMARY);
});

test('diagnostic records', async () => {
  vi.useFakeTimers();
  const { apiClient, logger, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  expect(await apiClient.getMostRecentPrinterDiagnostic()).toEqual(null);

  vi.setSystemTime(new Date(1000));
  await apiClient.addDiagnosticRecord({
    type: 'test-print',
    outcome: 'fail',
  });
  expect(
    await apiClient.getMostRecentPrinterDiagnostic()
  ).toEqual<DiagnosticRecord>({
    type: 'test-print',
    outcome: 'fail',
    timestamp: 1000,
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DiagnosticComplete,
    'system_administrator',
    {
      disposition: 'failure',
      message: 'Diagnostic (test-print) completed with outcome: fail.',
    }
  );

  vi.setSystemTime(new Date(2000));
  await apiClient.addDiagnosticRecord({
    type: 'test-print',
    outcome: 'pass',
  });
  expect(
    await apiClient.getMostRecentPrinterDiagnostic()
  ).toEqual<DiagnosticRecord>({
    type: 'test-print',
    outcome: 'pass',
    timestamp: 2000,
  });
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DiagnosticComplete,
    'system_administrator',
    {
      disposition: 'success',
      message: 'Diagnostic (test-print) completed with outcome: pass.',
    }
  );

  vi.useRealTimers();
});

test('unconfiguring clears diagnostic records', async () => {
  vi.useFakeTimers();
  const { apiClient, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  expect(await apiClient.getMostRecentPrinterDiagnostic()).toEqual(null);

  vi.setSystemTime(new Date(1000));
  await apiClient.addDiagnosticRecord({
    type: 'test-print',
    outcome: 'pass',
  });
  expect(
    await apiClient.getMostRecentPrinterDiagnostic()
  ).toEqual<DiagnosticRecord>({
    type: 'test-print',
    outcome: 'pass',
    timestamp: 1000,
  });

  await apiClient.unconfigure();
  expect(await apiClient.getMostRecentPrinterDiagnostic()).toEqual(null);

  vi.useRealTimers();
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

test('test-page print', async () => {
  const { apiClient, logger, mockPrinterHandler, auth } =
    buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  // can log failure if test page never makes it to the printer
  await apiClient.printTestPage();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DiagnosticInit,
    'system_administrator',
    {
      disposition: 'failure',
      message:
        'Error attempting to send test page to the printer: cannot print without printer connected',
    }
  );

  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);

  await apiClient.printTestPage();
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DiagnosticInit,
    'system_administrator',
    {
      disposition: 'success',
      message: 'User started a print diagnostic by printing a test page.',
    }
  );

  // it's not important to test the exact content of the test print, only that it
  // prints the sort of text, lines, and shading that will appear on our actual reports
  await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'test-print',
    failureThreshold: 0.0001,
  });
});

test('print or save readiness report', async () => {
  const { apiClient, mockPrinterHandler, auth, logger, mockUsbDrive } =
    buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  await configureMachine(
    apiClient,
    auth,
    readElectionTwoPartyPrimaryDefinition()
  );
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  await apiClient.printTestPage();
  vi.useFakeTimers().setSystemTime(new Date('2021-01-01T00:00:00.000'));
  await apiClient.addDiagnosticRecord({
    type: 'test-print',
    outcome: 'pass',
  });
  vi.useRealTimers();

  mockUsbDrive.insertUsbDrive({});
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();
  const exportFileResult = await apiClient.saveReadinessReport();
  exportFileResult.assertOk('error saving readiness report to USB');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ReadinessReportSaved,
    'system_administrator',
    {
      disposition: 'success',
      message: 'User saved the equipment readiness report to a USB drive.',
    }
  );

  const printPath = exportFileResult.unsafeUnwrap()[0]!;
  await expect(printPath).toMatchPdfSnapshot({
    customSnapshotIdentifier: 'readiness-report',
    failureThreshold: 0.0001,
  });

  const pdfContents = await pdfToText(printPath);
  expect(pdfContents).toContain('VxAdmin Readiness Report');
  expect(pdfContents).toContain('Example Primary Election');
  expect(pdfContents).toContain('Battery Level: 50%');
  expect(pdfContents).toContain('Power Source: External Power Supply');
  expect(pdfContents).toContain('Free Disk Space: 90% (9 GB / 10 GB)');
  expect(pdfContents).toContain('Ready to print');
  expect(pdfContents).toContain('Toner Level: 100%');
  expect(pdfContents).toContain('Test print successful, 1/1/2021, 12:00:00 AM');
});

test('save readiness report failure logging', async () => {
  const { apiClient, auth, logger, mockUsbDrive } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  mockUsbDrive.removeUsbDrive();
  const exportResult = await apiClient.saveReadinessReport();
  exportResult.assertErr('unexpected success saving readiness report to USB');
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.ReadinessReportSaved,
    'system_administrator',
    {
      disposition: 'failure',
      message:
        'Error while attempting to save the equipment readiness report to a USB drive: No USB drive found',
    }
  );
});

test('getDiskSpaceSummary', async () => {
  const { apiClient } = buildTestEnvironment();

  expect(await apiClient.getDiskSpaceSummary()).toEqual(
    MOCK_DISK_SPACE_SUMMARY
  );
});
