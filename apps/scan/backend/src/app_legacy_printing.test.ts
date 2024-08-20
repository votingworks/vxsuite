import { assert } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { BROTHER_THERMAL_PRINTER_CONFIG } from '@votingworks/printing';
import { suppressingConsoleOutput } from '@votingworks/test-utils';
import { configureApp } from '../test/helpers/shared_helpers';
import { scanBallot, withApp } from '../test/helpers/pdi_helpers';

jest.setTimeout(60_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.USE_BROTHER_PRINTER
  );
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
jest.mock('./util/get_current_time', () => ({
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

test('can print and re-print polls opened report', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockPrinterHandler,
      mockAuth,
      workspace,
      clock,
    }) => {
      mockPrinterHandler.connectPrinter(BROTHER_THERMAL_PRINTER_CONFIG);
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        openPolls: false,
      });

      // printing report before polls opened should fail
      await suppressingConsoleOutput(async () => {
        await expect(apiClient.printReport()).rejects.toThrow();
      });

      // initial polls opened report
      (await apiClient.openPolls()).unsafeUnwrap();
      await apiClient.printReport();
      const initialReportPath = mockPrinterHandler.getLastPrintPath();
      assert(initialReportPath !== undefined);
      await expect(initialReportPath).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'legacy-polls-opened-report',
        failureThreshold: 0.001,
      });

      // allows re-printing identical polls opened report
      await apiClient.printReport();
      const reprintedReportPath = mockPrinterHandler.getLastPrintPath();
      assert(reprintedReportPath !== undefined);
      await expect(reprintedReportPath).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'legacy-polls-opened-report',
        failureThreshold: 0.001,
      });

      // scan a ballot
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);

      // you should not be able to print polls opened reports after scanning
      await suppressingConsoleOutput(async () => {
        await expect(apiClient.printReport()).rejects.toThrow();
      });
    }
  );
});

test('can print voting paused and voting resumed reports', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockPrinterHandler,
      mockAuth,
      workspace,
      clock,
    }) => {
      mockPrinterHandler.connectPrinter(BROTHER_THERMAL_PRINTER_CONFIG);
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
      });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);

      // pause voting
      await apiClient.pauseVoting();
      await apiClient.printReport();
      await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'legacy-voting-paused-report',
        failureThreshold: 0.001,
      });

      // resume voting
      await apiClient.resumeVoting();
      await apiClient.printReport();
      await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'legacy-voting-resumed-report',
        failureThreshold: 0.001,
      });
    }
  );
});

test('can tabulate results and print polls closed report', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockPrinterHandler,
      mockAuth,
      workspace,
      clock,
    }) => {
      mockPrinterHandler.connectPrinter(BROTHER_THERMAL_PRINTER_CONFIG);
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
      });

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 1);
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 2);

      // close polls
      await apiClient.closePolls();
      await apiClient.printReport();
      await expect(mockPrinterHandler.getLastPrintPath()).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'legacy-polls-closed-report',
        failureThreshold: 0.001,
      });
    }
  );
});
