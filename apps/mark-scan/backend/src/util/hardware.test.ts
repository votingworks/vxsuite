import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import tmp from 'tmp';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { LogEventId, Logger, mockLogger } from '@votingworks/logging';
import { join } from 'node:path';
import {
  getMarkScanBmdModel,
  isAccessibleControllerDaemonRunning,
  PID_FILENAME,
} from './hardware';

jest.mock('@votingworks/backend');
const featureFlagMock = getFeatureFlagMock();
jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
      featureFlagMock.isEnabled(flag),
  };
});

let workspaceDir: tmp.DirResult;
const MOCK_PID = 12345;
let processKillSpy: jest.SpyInstance;
let logger: Logger;
let tmpFile: tmp.FileResult;

beforeEach(() => {
  workspaceDir = tmp.dirSync();
  tmpFile = tmp.fileSync({ name: PID_FILENAME, dir: workspaceDir.name });
  logger = mockLogger();

  processKillSpy = jest.spyOn(process, 'kill').mockImplementation((pid) => {
    if (pid === MOCK_PID) {
      return true;
    }

    const err = new Error('No such process') as NodeJS.ErrnoException;
    err.code = 'ESRCH';
    throw err;
  });
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
  processKillSpy.mockClear();
  tmpFile.removeCallback();
});

test('when bmd-150 flag is on', () => {
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.MARK_SCAN_USE_BMD_150
  );

  expect(getMarkScanBmdModel()).toEqual('bmd-150');
});

test('when bmd-150 flag is off', () => {
  expect(getMarkScanBmdModel()).toEqual('bmd-155');
});

test('when daemon PID is running', async () => {
  const pidStr = MOCK_PID.toString();
  fs.writeSync(tmpFile.fd, Buffer.from(pidStr), 0, pidStr.length, 0);
  expect(
    await isAccessibleControllerDaemonRunning(workspaceDir.name, logger)
  ).toEqual(true);
  expect(logger.log).not.toHaveBeenCalled();
});

test('when daemon PID is not running', async () => {
  const wrongPidStr = '98765';
  fs.writeSync(tmpFile.fd, Buffer.from(wrongPidStr), 0, wrongPidStr.length, 0);
  expect(
    await isAccessibleControllerDaemonRunning(workspaceDir.name, logger)
  ).toEqual(false);
  expect(logger.log).toHaveBeenCalledWith(LogEventId.NoPid, 'system', {
    message: `Process with PID ${wrongPidStr} is not running`,
  });
});

test('permission denied', async () => {
  processKillSpy.mockClear();
  processKillSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
    const err = new Error('Permission denied') as NodeJS.ErrnoException;
    err.code = 'EPERM';
    throw err;
  });

  expect(
    await isAccessibleControllerDaemonRunning(workspaceDir.name, logger)
  ).toEqual(false);
  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.PermissionDenied,
    'system',
    {
      message: 'Permission denied to check PID',
    }
  );
});

test('unknown error', async () => {
  processKillSpy.mockClear();
  processKillSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
    const err = new Error('Other error') as NodeJS.ErrnoException;
    err.code = 'something else';
    throw err;
  });

  expect(
    await isAccessibleControllerDaemonRunning(workspaceDir.name, logger)
  ).toEqual(false);
  expect(logger.log).toHaveBeenCalledWith(LogEventId.UnknownError, 'system', {
    message: 'Unknown error when checking PID',
    error: expect.anything(),
    disposition: 'failure',
  });
});

test('when PID file does not exist', async () => {
  expect(
    await isAccessibleControllerDaemonRunning(
      join(__dirname, 'not-a-real-dir'),
      logger
    )
  ).toEqual(false);
  expect(logger.log).toHaveBeenCalledWith(LogEventId.NoPid, 'system', {
    message: 'Unable to read accessible controller daemon PID file',
    error: expect.anything(),
  });
});

test('when reported PID is not a number', async () => {
  const wrongPidStr = 'not a number';
  fs.writeSync(tmpFile.fd, Buffer.from(wrongPidStr), 0, wrongPidStr.length, 0);

  expect(
    await isAccessibleControllerDaemonRunning(workspaceDir.name, logger)
  ).toEqual(false);
  expect(logger.log).toHaveBeenCalledWith(LogEventId.ParseError, 'system', {
    message: `Unable to parse accessible controller daemon PID: ${wrongPidStr}`,
    disposition: 'failure',
  });
});
