import { mockOf } from '@votingworks/test-utils';
import {
  DiskSpaceSummary,
  getBatteryInfo,
  initializeGetWorkspaceDiskSpaceSummary,
  pdfToText,
} from '@votingworks/backend';
import { LogEventId } from '@votingworks/logging';
import { join } from 'path';
import { DiagnosticRecord, TEST_JURISDICTION } from '@votingworks/types';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { mockSystemAdministratorAuth } from '../test/helpers/auth';
import { withApp } from '../test/helpers/setup_app';

jest.setTimeout(20_000);

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

test('getDiskSpaceSummary', async () => {
  await withApp(async ({ apiClient }) => {
    expect(await apiClient.getApplicationDiskSpaceSummary()).toEqual(
      MOCK_DISK_SPACE_SUMMARY
    );
  });
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
jest.mock('./util/get_current_time', () => ({
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

const jurisdiction = TEST_JURISDICTION;

test('save readiness report', async () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  await withApp(
    async ({ apiClient, mockUsbDrive, scanner, auth, logger, importer }) => {
      mockSystemAdministratorAuth(auth);
      importer.configure(
        electionDefinition,
        jurisdiction,
        'test-election-package-hash'
      );

      // mock a successful scan diagnostic
      jest.useFakeTimers();
      jest.setSystemTime(reportPrintedTime.getTime());
      scanner
        .withNextScannerSession()
        .sheet({
          frontPath: join(__dirname, '../test/fixtures/blank-sheet-front.jpg'),
          backPath: join(__dirname, '../test/fixtures/blank-sheet-back.jpg'),
        })
        .end();
      await apiClient.performScanDiagnostic();
      jest.useRealTimers();

      mockUsbDrive.insertUsbDrive({});
      const exportResult = await apiClient.saveReadinessReport();
      exportResult.assertOk('Failed to save readiness report');
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.ReadinessReportSaved,
        'system_administrator',
        {
          disposition: 'success',
          message: 'User saved the equipment readiness report to a USB drive.',
        }
      );

      const exportPath = exportResult.ok()![0];
      await expect(exportPath).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'readiness-report',
      });

      const pdfContents = await pdfToText(exportPath);
      expect(pdfContents).toContain('VxCentralScan Readiness Report');
      expect(pdfContents).toContain('Battery Level: 50%');
      expect(pdfContents).toContain('Power Source: External Power Supply');
      expect(pdfContents).toContain('Free Disk Space: 90% (9 GB / 10 GB)');
      expect(pdfContents).toContain('Connected');

      mockUsbDrive.removeUsbDrive();
    }
  );
});

describe('scan diagnostic', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('pass', async () => {
    await withApp(async ({ apiClient, scanner, auth, logger }) => {
      mockSystemAdministratorAuth(auth);

      scanner
        .withNextScannerSession()
        .sheet({
          frontPath: join(__dirname, '../test/fixtures/blank-sheet-front.jpg'),
          backPath: join(__dirname, '../test/fixtures/blank-sheet-back.jpg'),
        })
        .end();

      await apiClient.performScanDiagnostic();

      expect(
        await apiClient.getMostRecentScannerDiagnostic()
      ).toEqual<DiagnosticRecord>({
        type: 'blank-sheet-scan',
        outcome: 'pass',
        timestamp: 0,
      });

      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.DiagnosticInit,
        {
          message:
            'Starting diagnostic scan. Test sheet should be a blank sheet of white paper.',
        }
      );
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.DiagnosticComplete,
        {
          disposition: 'success',
          message: 'Diagnostic scan succeeded.',
        }
      );
    });
  });

  test('fail on first page', async () => {
    await withApp(async ({ apiClient, scanner, auth, logger }) => {
      mockSystemAdministratorAuth(auth);

      scanner
        .withNextScannerSession()
        .sheet({
          frontPath: join(__dirname, '../test/fixtures/streaked-page.jpg'),
          backPath: join(__dirname, '../test/fixtures/blank-sheet-back.jpg'),
        })
        .end();
      await apiClient.performScanDiagnostic();

      expect(
        await apiClient.getMostRecentScannerDiagnostic()
      ).toEqual<DiagnosticRecord>({
        type: 'blank-sheet-scan',
        outcome: 'fail',
        timestamp: 0,
      });
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.DiagnosticComplete,
        {
          disposition: 'failure',
          message:
            'Diagnostic scan failed. The paper may not be blank or the scanner may need to be cleaned.',
        }
      );
    });
  });

  test('fail on second page', async () => {
    await withApp(async ({ apiClient, scanner, auth, logger }) => {
      mockSystemAdministratorAuth(auth);

      scanner
        .withNextScannerSession()
        .sheet({
          frontPath: join(__dirname, '../test/fixtures/blank-sheet-front.jpg'),
          backPath: join(__dirname, '../test/fixtures/streaked-page.jpg'),
        })
        .end();
      await apiClient.performScanDiagnostic();

      expect(
        await apiClient.getMostRecentScannerDiagnostic()
      ).toEqual<DiagnosticRecord>({
        type: 'blank-sheet-scan',
        outcome: 'fail',
        timestamp: 0,
      });
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.DiagnosticComplete,
        {
          disposition: 'failure',
          message:
            'Diagnostic scan failed. The paper may not be blank or the scanner may need to be cleaned.',
        }
      );
    });
  });

  test('fail on no scan ', async () => {
    await withApp(async ({ apiClient, scanner, auth, logger }) => {
      mockSystemAdministratorAuth(auth);

      scanner.withNextScannerSession().end();
      await apiClient.performScanDiagnostic();

      expect(
        await apiClient.getMostRecentScannerDiagnostic()
      ).toEqual<DiagnosticRecord>({
        type: 'blank-sheet-scan',
        outcome: 'fail',
        timestamp: 0,
      });
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.DiagnosticComplete,
        {
          disposition: 'failure',
          message: 'No test sheet detected for scan diagnostic.',
        }
      );
    });
  });
});
