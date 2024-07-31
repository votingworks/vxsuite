import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { err } from '@votingworks/basics';
import { LogEventId } from '@votingworks/logging';
import { DiagnosticRecord } from '@votingworks/types';
import { withApp } from '../test/helpers/pdi_helpers';
import { TEST_PRINT_USER_FAIL_REASON } from './util/diagnostics';

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
    BooleanEnvironmentVariableName.SCAN_USE_FUJITSU_PRINTER
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
