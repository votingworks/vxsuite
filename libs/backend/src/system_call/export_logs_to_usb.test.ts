/* istanbul ignore file - test util */

import { createMockUsbDrive } from '@votingworks/usb-drive';
import * as fs from 'node:fs/promises';
import { Stats, createReadStream, createWriteStream } from 'node:fs';
import { mockOf } from '@votingworks/test-utils';
import { LogEventId, MockLogger, mockLogger } from '@votingworks/logging';
import { tmpNameSync } from 'tmp';
import { PassThrough } from 'node:stream';
import { execFile } from '../exec';
import { exportLogsToUsb } from './export_logs_to_usb';

jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  stat: jest.fn().mockRejectedValue(new Error('not mocked yet')),
  readdir: jest.fn(),
}));
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  createReadStream: jest.fn(),
  createWriteStream: jest.fn(),
}));
const { createReadStream: realCreateReadStream } =
  jest.requireActual('node:fs');
const createReadStreamMock = mockOf(createReadStream) as jest.Mock;
const createWriteStreamMock = mockOf(createWriteStream) as jest.Mock;

createReadStreamMock.mockImplementation(realCreateReadStream);

jest.mock('../exec', (): typeof import('../exec') => ({
  ...jest.requireActual('../exec'),
  execFile: jest.fn(),
}));

const execFileMock = mockOf(execFile);

let logger: MockLogger;

beforeEach(() => {
  logger = mockLogger({ fn: jest.fn });
  createWriteStreamMock.mockReturnValue(new PassThrough());
  createReadStreamMock.mockReset();
});

test('exportLogsToUsb without logs directory', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        logger,
        machineId: 'TEST-MACHINE-ID',
        codeVersion: 'TEST-CODE-VERSION',
        format: 'vxf',
      })
    ).err()
  ).toEqual('no-logs-directory');

  // now we have the filesystem entry, but it's a file not a directory
  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(false);
  mockOf(fs.stat).mockResolvedValue(mockStats);

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        logger,
        machineId: 'TEST-MACHINE-ID',
        codeVersion: 'TEST-CODE-VERSION',
        format: 'vxf',
      })
    ).err()
  ).toEqual('no-logs-directory');

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
      message: 'Failed to save logs to usb drive: no-logs-directory',
    })
  );
});

test('exportLogsToUsb without USB', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.removeUsbDrive();

  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(true);
  mockOf(fs.stat).mockResolvedValue(mockStats);

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        logger,
        machineId: 'TEST-MACHINE-ID',
        codeVersion: 'TEST-CODE-VERSION',
        format: 'vxf',
      })
    ).err()
  ).toEqual('no-usb-drive');
});

test('exportLogsToUsb with unknown failure', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});

  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(true);
  mockOf(fs.stat).mockResolvedValueOnce(mockStats);

  execFileMock.mockImplementationOnce(() => {
    throw new Error('boo');
  });

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        logger,
        machineId: 'TEST-MACHINE-ID',
        codeVersion: 'TEST-CODE-VERSION',
        format: 'vxf',
      })
    ).err()
  ).toEqual('copy-failed');
});

test('exportLogsToUsb works for vxf format when all conditions are met', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.status.reset();
  mockUsbDrive.usbDrive.status.expectRepeatedCallsWith().resolves({
    status: 'mounted',
    mountPoint: '/media/usb-drive',
  });
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();

  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(true);
  mockOf(fs.stat).mockResolvedValueOnce(mockStats);

  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        logger,
        machineId: 'TEST-MACHINE-ID',
        codeVersion: 'TEST-CODE-VERSION',
        format: 'vxf',
      })
    ).isOk()
  ).toBeTruthy();
  expect(mockOf(fs.stat)).toHaveBeenCalledWith('/var/log/votingworks');

  expect(execFileMock).toHaveBeenCalledWith('mkdir', [
    '-p',
    '/media/usb-drive/logs/machine_TEST-MACHINE-ID',
  ]);

  expect(execFileMock).toHaveBeenCalledWith('cp', [
    '-r',
    '/var/log/votingworks',
    expect.stringMatching('^/media/usb-drive/logs/machine_TEST-MACHINE-ID/'),
  ]);

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'unknown',
    expect.objectContaining({
      disposition: 'success',
      message: 'Successfully saved logs on the usb drive.',
    })
  );

  mockUsbDrive.assertComplete();
});

test('exportLogsToUsb returns error when cdf conversion fails', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.status.reset();
  mockUsbDrive.usbDrive.status.expectRepeatedCallsWith().resolves({
    status: 'mounted',
    mountPoint: '/media/usb-drive',
  });

  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(true);
  mockOf(fs.stat).mockResolvedValueOnce(mockStats);
  const readdirMock = fs.readdir as unknown as jest.Mock<Promise<string[]>>;
  readdirMock.mockResolvedValue(['vx-logs.log', 'vx-logs.log-20240101.gz']);

  const logFile = tmpNameSync();
  await fs.writeFile(logFile, ``);
  createReadStreamMock.mockReturnValueOnce(
    realCreateReadStream(logFile, 'utf8')
  );
  // There will be an error uncompressing if this is an empty file
  createReadStreamMock.mockReturnValueOnce(
    realCreateReadStream(logFile, 'utf8')
  );

  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

  const result = await exportLogsToUsb({
    usbDrive: mockUsbDrive.usbDrive,
    logger,
    machineId: 'TEST-MACHINE-ID',
    codeVersion: 'TEST-CODE-VERSION',
    format: 'cdf',
  });
  expect(result.isErr()).toBeTruthy();
  expect(result.err()).toEqual('cdf-conversion-failed');
});

test('exportLogsToUsb returns error when error filtering fails', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.status.reset();
  mockUsbDrive.usbDrive.status.expectRepeatedCallsWith().resolves({
    status: 'mounted',
    mountPoint: '/media/usb-drive',
  });

  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(true);
  mockOf(fs.stat).mockResolvedValueOnce(mockStats);
  const readdirMock = fs.readdir as unknown as jest.Mock<Promise<string[]>>;
  readdirMock.mockResolvedValue(['vx-logs.log', 'vx-logs.log-20240101.gz']);

  const logFile = tmpNameSync();
  await fs.writeFile(logFile, ``);
  createReadStreamMock.mockReturnValueOnce(
    realCreateReadStream(logFile, 'utf8')
  );
  // There will be an error uncompressing if this is an empty file
  createReadStreamMock.mockReturnValueOnce(
    realCreateReadStream(logFile, 'utf8')
  );

  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

  const result = await exportLogsToUsb({
    usbDrive: mockUsbDrive.usbDrive,
    logger,
    machineId: 'TEST-MACHINE-ID',
    codeVersion: 'TEST-CODE-VERSION',
    format: 'err',
  });
  expect(result.isErr()).toBeTruthy();
  expect(result.err()).toEqual('error-filtering-failed');
});

test('exportLogsToUsb works for cdf format when all conditions are met', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.status.reset();
  mockUsbDrive.usbDrive.status.expectRepeatedCallsWith().resolves({
    status: 'mounted',
    mountPoint: '/media/usb-drive',
  });
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();

  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(true);
  mockOf(fs.stat).mockResolvedValueOnce(mockStats);
  const readdirMock = fs.readdir as unknown as jest.Mock<Promise<string[]>>;
  readdirMock.mockResolvedValue(['vx-logs.log']);

  const logFile = tmpNameSync();
  await fs.writeFile(logFile, ``);
  createReadStreamMock.mockReturnValueOnce(
    realCreateReadStream(logFile, 'utf8')
  );

  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        logger,
        machineId: 'TEST-MACHINE-ID',
        codeVersion: 'TEST-CODE-VERSION',
        format: 'cdf',
      })
    ).isOk()
  ).toBeTruthy();
  expect(mockOf(fs.stat)).toHaveBeenCalledWith('/var/log/votingworks');

  expect(execFileMock).toHaveBeenCalledWith('mkdir', [
    '-p',
    '/media/usb-drive/logs/machine_TEST-MACHINE-ID',
  ]);

  expect(execFileMock).toHaveBeenCalledWith('cp', [
    '-r',
    expect.stringContaining('/tmp/'),
    expect.stringMatching('^/media/usb-drive/logs/machine_TEST-MACHINE-ID/'),
  ]);

  expect(createWriteStreamMock).toHaveBeenCalledWith(
    expect.stringContaining('vx-logs.cdf.log.json')
  );

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.LogConversionToCdfComplete,
    'unknown',
    expect.objectContaining({
      disposition: 'success',
      message: expect.anything(),
    })
  );

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'unknown',
    expect.objectContaining({
      disposition: 'success',
      message: 'Successfully saved logs on the usb drive.',
    })
  );

  mockUsbDrive.assertComplete();
});

test('exportLogsToUsb works for error format when all conditions are met', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.status.reset();
  mockUsbDrive.usbDrive.status.expectRepeatedCallsWith().resolves({
    status: 'mounted',
    mountPoint: '/media/usb-drive',
  });
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();

  const mockStats = new Stats();
  mockStats.isDirectory = jest.fn().mockReturnValue(true);
  mockOf(fs.stat).mockResolvedValueOnce(mockStats);
  const readdirMock = fs.readdir as unknown as jest.Mock<Promise<string[]>>;
  readdirMock.mockResolvedValue(['vx-logs.log']);

  const logFile = tmpNameSync();
  await fs.writeFile(logFile, ``);
  createReadStreamMock.mockReturnValueOnce(
    realCreateReadStream(logFile, 'utf8')
  );

  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

  expect(
    (
      await exportLogsToUsb({
        usbDrive: mockUsbDrive.usbDrive,
        logger,
        machineId: 'TEST-MACHINE-ID',
        codeVersion: 'TEST-CODE-VERSION',
        format: 'err',
      })
    ).isOk()
  ).toBeTruthy();
  expect(mockOf(fs.stat)).toHaveBeenCalledWith('/var/log/votingworks');

  expect(execFileMock).toHaveBeenCalledWith('mkdir', [
    '-p',
    '/media/usb-drive/logs/machine_TEST-MACHINE-ID',
  ]);

  expect(execFileMock).toHaveBeenCalledWith('cp', [
    '-r',
    expect.stringContaining('/tmp/'),
    expect.stringMatching('^/media/usb-drive/logs/machine_TEST-MACHINE-ID/'),
  ]);

  expect(createWriteStreamMock).toHaveBeenCalledWith(
    expect.stringContaining('vx-logs.errors.log')
  );

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'unknown',
    expect.objectContaining({
      disposition: 'success',
      message: 'Successfully saved logs on the usb drive.',
    })
  );

  mockUsbDrive.assertComplete();
});
