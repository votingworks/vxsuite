import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import * as grout from '@votingworks/grout';
import { Server } from 'http';
import { Logger } from '@votingworks/logging';
import { mockOf } from '@votingworks/test-utils';
import { DiagnosticRecord } from '@votingworks/types';
import {
  DiskSpaceSummary,
  initializeGetWorkspaceDiskSpaceSummary,
} from '@votingworks/backend';
import { readFile } from 'fs/promises';
import { Api } from './app';
import { PatConnectionStatusReader } from './pat-input/connection_status_reader';
import { createApp } from '../test/app_helpers';
import { PaperHandlerStateMachine } from './custom-paper-handler/state_machine';
import { MOCK_VIRTUAL_INPUT_DEVICE_OUTPUT } from './util/controllerd.test';

const TEST_POLLING_INTERVAL_MS = 5;

jest.mock('fs/promises', (): typeof import('fs/promises') => {
  return {
    ...jest.requireActual('fs/promises'),
    readFile: jest.fn(),
  };
});

jest.mock('@votingworks/custom-paper-handler');
jest.mock('./pat-input/connection_status_reader');

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
    initializeGetWorkspaceDiskSpaceSummary: jest.fn(),
  })
);

let apiClient: grout.Client<Api>;
let server: Server;
let stateMachine: PaperHandlerStateMachine;
let patConnectionStatusReader: PatConnectionStatusReader;
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
});

test('getApplicationDiskSpaceSummary', async () => {
  expect(await apiClient.getApplicationDiskSpaceSummary()).toEqual(
    MOCK_DISK_SPACE_SUMMARY
  );
});

test('getIsAccessibleControllerInputDetected', async () => {
  mockOf(readFile).mockResolvedValueOnce(`\n`);
  expect(await apiClient.getIsAccessibleControllerInputDetected()).toEqual(
    false
  );
  mockOf(readFile).mockResolvedValueOnce(MOCK_VIRTUAL_INPUT_DEVICE_OUTPUT);
  expect(await apiClient.getIsAccessibleControllerInputDetected()).toEqual(
    true
  );
});
