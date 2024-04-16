import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import * as grout from '@votingworks/grout';
import { Server } from 'http';
import { LogEventId, Logger } from '@votingworks/logging';
import { mockOf } from '@votingworks/test-utils';
import { DiagnosticRecord } from '@votingworks/types';
import {
  DiskSpaceSummary,
  getBatteryInfo,
  initializeGetWorkspaceDiskSpaceSummary,
  pdfToText,
} from '@votingworks/backend';
import { MockUsbDrive } from '@votingworks/usb-drive';
import { Api } from './app';
import { PatConnectionStatusReader } from './pat-input/connection_status_reader';
import { createApp } from '../test/app_helpers';
import { PaperHandlerStateMachine } from './custom-paper-handler/state_machine';
import { isAccessibleControllerDaemonRunning } from './util/controllerd';

const TEST_POLLING_INTERVAL_MS = 5;

jest.mock('fs/promises', (): typeof import('fs/promises') => {
  return {
    ...jest.requireActual('fs/promises'),
    readFile: jest.fn(),
  };
});

jest.mock('@votingworks/custom-paper-handler');

const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

const MOCK_DISK_SPACE_SUMMARY: DiskSpaceSummary = {
  total: 10 * 1_000_000,
  used: 1 * 1_000_000,
  available: 9 * 1_000_000,
};

jest.mock(
  '@votingworks/backend',
  (): typeof import('@votingworks/backend') => ({
    ...jest.requireActual('@votingworks/backend'),
    getBatteryInfo: jest.fn(),
    initializeGetWorkspaceDiskSpaceSummary: jest.fn(),
  })
);

jest.mock('./pat-input/connection_status_reader');
jest.mock('./util/controllerd');

let apiClient: grout.Client<Api>;
let server: Server;
let stateMachine: PaperHandlerStateMachine;
let patConnectionStatusReader: PatConnectionStatusReader;
let mockUsbDrive: MockUsbDrive;
let logger: Logger;

beforeEach(async () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );

  patConnectionStatusReader = new PatConnectionStatusReader(logger);
  mockOf(patConnectionStatusReader.isPatDeviceConnected).mockResolvedValue(
    false
  );

  mockOf(initializeGetWorkspaceDiskSpaceSummary).mockReturnValue(() =>
    Promise.resolve(MOCK_DISK_SPACE_SUMMARY)
  );

  const result = await createApp({
    patConnectionStatusReader,
    pollingIntervalMs: TEST_POLLING_INTERVAL_MS,
  });
  apiClient = result.apiClient;
  logger = result.logger;
  server = result.server;
  stateMachine = result.stateMachine;
  mockUsbDrive = result.mockUsbDrive;
});

afterEach(async () => {
  await stateMachine.cleanUp();
  server?.close();
});

test('diagnostic records', async () => {
  expect(
    await apiClient.getMostRecentAccessibleControllerDiagnostic()
  ).toBeNull();
  jest.useFakeTimers().setSystemTime(0);
  await apiClient.addDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'fail',
    message: 'up button not working',
  });
  expect(
    await apiClient.getMostRecentAccessibleControllerDiagnostic()
  ).toEqual<DiagnosticRecord>({
    type: 'mark-scan-accessible-controller',
    outcome: 'fail',
    message: 'up button not working',
    timestamp: 0,
  });
  jest.setSystemTime(1000);
  await apiClient.addDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
  });
  expect(
    await apiClient.getMostRecentAccessibleControllerDiagnostic()
  ).toEqual<DiagnosticRecord>({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
    timestamp: 1000,
  });

  jest.useRealTimers();
});

test('getApplicationDiskSpaceSummary', async () => {
  expect(await apiClient.getApplicationDiskSpaceSummary()).toEqual(
    MOCK_DISK_SPACE_SUMMARY
  );
});

test('getIsAccessibleControllerInputDetected', async () => {
  mockOf(isAccessibleControllerDaemonRunning).mockResolvedValueOnce(false);
  expect(await apiClient.getIsAccessibleControllerInputDetected()).toEqual(
    false
  );
  mockOf(isAccessibleControllerDaemonRunning).mockResolvedValueOnce(true);
  expect(await apiClient.getIsAccessibleControllerInputDetected()).toEqual(
    true
  );
});

const reportPrintedTime = new Date('2021-01-01T00:00:00.000');
jest.mock('./util/get_current_time', () => ({
  getCurrentTime: () => reportPrintedTime.getTime(),
}));

test('saving the readiness report', async () => {
  jest.useFakeTimers().setSystemTime(reportPrintedTime.getTime());
  await apiClient.addDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
  });
  mockOf(isAccessibleControllerDaemonRunning).mockResolvedValueOnce(true);
  mockOf(getBatteryInfo).mockResolvedValue({
    level: 0.5,
    discharging: false,
  });
  jest.useRealTimers();

  mockUsbDrive.insertUsbDrive({});
  const exportResult = await apiClient.saveReadinessReport();
  exportResult.assertOk('Failed to save readiness report');
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ReadinessReportSaved,
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
  expect(pdfContents).toContain('VxMarkScan Readiness Report');
  expect(pdfContents).toContain('Battery Level: 50%');
  expect(pdfContents).toContain('Power Source: External Power Supply');
  expect(pdfContents).toContain('Free Disk Space: 90% (9 GB / 10 GB)');
  expect(pdfContents).toContain('Detected');

  mockUsbDrive.removeUsbDrive();
});

test('failure saving the readiness report', async () => {
  jest.useFakeTimers().setSystemTime(reportPrintedTime.getTime());
  await apiClient.addDiagnosticRecord({
    type: 'mark-scan-accessible-controller',
    outcome: 'pass',
  });
  mockOf(isAccessibleControllerDaemonRunning).mockResolvedValueOnce(true);
  mockOf(getBatteryInfo).mockResolvedValue({
    level: 0.5,
    discharging: false,
  });
  jest.useRealTimers();

  mockUsbDrive.removeUsbDrive();
  const exportResult = await apiClient.saveReadinessReport();
  exportResult.assertErr('unexpected success');
  expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
    LogEventId.ReadinessReportSaved,
    {
      disposition: 'failure',
      message:
        'Error while attempting to save the equipment readiness report to a USB drive: No USB drive found',
    }
  );
});
