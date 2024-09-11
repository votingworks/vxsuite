import { LogEventId } from '@votingworks/logging';
import { HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import {
  DiskSpaceSummary,
  getBatteryInfo,
  initializeGetWorkspaceDiskSpaceSummary,
  pdfToText,
} from '@votingworks/backend';
import { mockOf } from '@votingworks/test-utils';
import { DiagnosticRecord } from '@votingworks/types';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  buildTestEnvironment,
  configureMachine,
  mockSystemAdministratorAuth,
} from '../test/app';

jest.setTimeout(60_000);

jest.mock(
  '@votingworks/backend',
  (): typeof import('@votingworks/backend') => ({
    ...jest.requireActual('@votingworks/backend'),
    getBatteryInfo: jest.fn(),
    initializeGetWorkspaceDiskSpaceSummary: jest.fn(),
  })
);

const MOCK_DISK_SPACE_SUMMARY: DiskSpaceSummary = {
  total: 10 * 1_000_000,
  used: 1 * 1_000_000,
  available: 9 * 1_000_000,
};

beforeEach(() => {
  mockOf(getBatteryInfo).mockResolvedValue({
    level: 0.5,
    discharging: false,
  });
  mockOf(initializeGetWorkspaceDiskSpaceSummary).mockReturnValue(() =>
    Promise.resolve(MOCK_DISK_SPACE_SUMMARY)
  );
});

test('diagnostic records', async () => {
  jest.useFakeTimers();
  const { apiClient, logger, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  expect(await apiClient.getMostRecentPrinterDiagnostic()).toEqual(null);

  jest.setSystemTime(new Date(1000));
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

  jest.setSystemTime(new Date(2000));
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

  jest.useRealTimers();
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
jest.mock('./util/get_current_time', () => ({
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

test('test print', async () => {
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
  });
});

test('print or save readiness report', async () => {
  const { apiClient, mockPrinterHandler, auth, logger, mockUsbDrive } =
    buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  await configureMachine(apiClient, auth, electionTwoPartyPrimaryDefinition);
  mockPrinterHandler.connectPrinter(HP_LASER_PRINTER_CONFIG);
  await apiClient.printTestPage();
  jest.useFakeTimers().setSystemTime(new Date('2021-01-01T00:00:00.000'));
  await apiClient.addDiagnosticRecord({
    type: 'test-print',
    outcome: 'pass',
  });
  jest.useRealTimers();

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

test('getApplicationDiskSpaceSummary', async () => {
  const { apiClient } = buildTestEnvironment();

  expect(await apiClient.getApplicationDiskSpaceSummary()).toEqual(
    MOCK_DISK_SPACE_SUMMARY
  );
});
