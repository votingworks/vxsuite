import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { err } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { DiagnosticRecord } from '@votingworks/types';
import { mockOf } from '@votingworks/test-utils';
import {
  DiskSpaceSummary,
  initializeGetWorkspaceDiskSpaceSummary,
} from '@votingworks/backend';
import { withApp } from '../test/helpers/pdi_helpers';
import { TEST_PRINT_USER_FAIL_REASON } from './util/diagnostics';
import { configureApp } from '../test/helpers/shared_helpers';

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
});

const mockTime = new Date('2021-01-01T00:00:00.000');
jest.mock('./util/get_current_time', () => ({
  getCurrentTime: () => mockTime.getTime(),
}));

async function wrapWithFakeSystemTime<T>(fn: () => Promise<T>): Promise<T> {
  jest.useFakeTimers().setSystemTime(mockTime.getTime());
  const result = await fn();
  jest.useRealTimers();
  return result;
}

jest.mock(
  '@votingworks/backend',
  (): typeof import('@votingworks/backend') => ({
    ...jest.requireActual('@votingworks/backend'),
    initializeGetWorkspaceDiskSpaceSummary: jest.fn(),
  })
);

const MOCK_DISK_SPACE_SUMMARY: DiskSpaceSummary = {
  total: 10 * 1_000_000,
  used: 1 * 1_000_000,
  available: 9 * 1_000_000,
};

beforeEach(() => {
  mockOf(initializeGetWorkspaceDiskSpaceSummary).mockReturnValue(() =>
    Promise.resolve(MOCK_DISK_SPACE_SUMMARY)
  );
});

test('can print test page', async () => {
  await withApp(async ({ apiClient, mockFujitsuPrinterHandler, logger }) => {
    (await apiClient.printTestPage()).unsafeUnwrap();
    await expect(
      mockFujitsuPrinterHandler.getLastPrintPath()
    ).toMatchPdfSnapshot({
      customSnapshotIdentifier: 'print-test-page',
    });
    expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
      LogEventId.DiagnosticInit,
      {
        disposition: 'success',
        message: 'User initiated a test page print.',
      }
    );
  });
});

test('test page failing mid-print is logged', async () => {
  await withApp(async ({ apiClient, mockFujitsuPrinterHandler, logger }) => {
    expect(await apiClient.getMostRecentPrinterDiagnostic()).toBeNull();

    mockFujitsuPrinterHandler.setStatus({
      state: 'error',
      type: 'disconnected',
    });
    expect(
      await wrapWithFakeSystemTime(() => apiClient.printTestPage())
    ).toEqual(
      err({
        state: 'error',
        type: 'disconnected',
      })
    );

    expect(
      await apiClient.getMostRecentPrinterDiagnostic()
    ).toEqual<DiagnosticRecord>({
      message: 'The printer was disconnected while printing.',
      outcome: 'fail',
      timestamp: mockTime.getTime(),
      type: 'test-print',
    });
    expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
      LogEventId.DiagnosticComplete,
      {
        disposition: 'failure',
        message:
          'Test print failed. The printer was disconnected while printing.',
      }
    );
  });
});

test('user logged "pass" after a test print completes', async () => {
  await withApp(async ({ apiClient, logger }) => {
    expect(await apiClient.getMostRecentPrinterDiagnostic()).toBeNull();

    await wrapWithFakeSystemTime(() =>
      apiClient.logTestPrintOutcome({ outcome: 'pass' })
    );

    expect(
      await apiClient.getMostRecentPrinterDiagnostic()
    ).toEqual<DiagnosticRecord>({
      outcome: 'pass',
      timestamp: mockTime.getTime(),
      type: 'test-print',
    });
    expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
      LogEventId.DiagnosticComplete,
      {
        disposition: 'success',
        message: 'Test print successful.',
      }
    );
  });
});

test('user logged "fail" after a test print completes', async () => {
  await withApp(async ({ apiClient, logger }) => {
    expect(await apiClient.getMostRecentPrinterDiagnostic()).toBeNull();

    await wrapWithFakeSystemTime(() =>
      apiClient.logTestPrintOutcome({ outcome: 'fail' })
    );

    expect(
      await apiClient.getMostRecentPrinterDiagnostic()
    ).toEqual<DiagnosticRecord>({
      outcome: 'fail',
      message: TEST_PRINT_USER_FAIL_REASON,
      timestamp: mockTime.getTime(),
      type: 'test-print',
    });
    expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
      LogEventId.DiagnosticComplete,
      {
        disposition: 'failure',
        message: `Test print failed. ${TEST_PRINT_USER_FAIL_REASON}`,
      }
    );
  });
});

test('printing a readiness report ', async () => {
  await withApp(
    async ({ apiClient, mockUsbDrive, mockAuth, logger, workspace }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        openPolls: false,
      });
      mockUsbDrive.insertUsbDrive({});
      await wrapWithFakeSystemTime(async () => {
        await apiClient.logTestPrintOutcome({ outcome: 'pass' });
        workspace.store.addDiagnosticRecord({
          type: 'blank-sheet-scan',
          outcome: 'pass',
        });
      });

      const exportResult = await apiClient.saveReadinessReport();
      exportResult.assertOk('Failed to save readiness report');
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.ReadinessReportSaved,
        expect.anything(),
        {
          disposition: 'success',
          message: 'User saved the equipment readiness report to a USB drive.',
        }
      );

      const exportPath = exportResult.ok()![0];
      await expect(exportPath).toMatchPdfSnapshot({
        customSnapshotIdentifier: 'readiness-report',
      });
    }
  );
});
