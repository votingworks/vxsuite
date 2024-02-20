import { LogEventId } from '@votingworks/logging';
import { HP_LASER_PRINTER_CONFIG } from '@votingworks/printing';
import { buildTestEnvironment, mockSystemAdministratorAuth } from '../test/app';

test('diagnostic records', async () => {
  jest.useFakeTimers();
  const { apiClient, logger, auth } = buildTestEnvironment();
  mockSystemAdministratorAuth(auth);

  expect(await apiClient.getDiagnosticRecords()).toEqual([]);

  jest.setSystemTime(new Date(1000));
  await apiClient.addDiagnosticRecord({
    hardware: 'printer',
    outcome: 'fail',
  });
  expect(await apiClient.getDiagnosticRecords()).toEqual([
    {
      hardware: 'printer',
      outcome: 'fail',
      timestamp: 1000,
    },
  ]);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DiagnosticComplete,
    'system_administrator',
    {
      disposition: 'failure',
      message: 'Diagnostic test for the printer completed with outcome: fail.',
    }
  );

  jest.setSystemTime(new Date(2000));
  await apiClient.addDiagnosticRecord({
    hardware: 'printer',
    outcome: 'pass',
  });
  expect(await apiClient.getDiagnosticRecords()).toEqual([
    {
      hardware: 'printer',
      outcome: 'fail',
      timestamp: 1000,
    },
    {
      hardware: 'printer',
      outcome: 'pass',
      timestamp: 2000,
    },
  ]);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.DiagnosticComplete,
    'system_administrator',
    {
      disposition: 'success',
      message: 'Diagnostic test for the printer completed with outcome: pass.',
    }
  );

  jest.useRealTimers();
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000Z');
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
