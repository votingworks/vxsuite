import { beforeEach, expect, MockInstance, test, vi } from 'vitest';
import { createMockUsbDrive } from '@votingworks/usb-drive';
import * as fs from 'node:fs/promises';
import {
  Stats,
  WriteStream,
  createReadStream,
  createWriteStream,
} from 'node:fs';
import { LogEventId, MockLogger, mockLogger } from '@votingworks/logging';
import { makeTemporaryFile } from '@votingworks/fixtures';
import { PassThrough } from 'node:stream';
import { ok } from '@votingworks/basics';
import { convertVxLogToCdf } from '@votingworks/logging-utils';
import zlib from 'node:zlib';
import { execFile } from '../exec';
import { exportLogsToUsb, LogsExportError } from './export_logs_to_usb';

vi.mock(import('node:fs/promises'), async (importActual) => ({
  ...(await importActual()),
  stat: vi.fn().mockRejectedValue(new Error('not mocked yet')),
  readdir: vi.fn(),
}));
vi.mock(import('node:fs'), async (importActual) => ({
  ...(await importActual()),
  createReadStream: vi.fn(),
  createWriteStream: vi.fn(),
}));

vi.mock(
  import('../exec.js'),
  async (importActual): Promise<typeof import('../exec')> => ({
    ...(await importActual()),
    execFile: vi.fn(),
  })
);

vi.mock(import('@votingworks/logging-utils'));

const execFileMock = vi.mocked(execFile);

let logger: MockLogger;

beforeEach(async () => {
  const { createReadStream: realCreateReadStream } =
    await vi.importActual<typeof import('node:fs')>('node:fs');

  vi.mocked(createReadStream).mockImplementation(realCreateReadStream);

  logger = mockLogger({ fn: vi.fn });
  vi.mocked(createWriteStream).mockReturnValue(
    new PassThrough() as unknown as WriteStream
  );
  vi.mocked(createReadStream).mockReset();
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
  ).toEqual<LogsExportError>({ code: 'no-logs-directory' });

  // now we have the filesystem entry, but it's a file not a directory
  const mockStats = new Stats();
  mockStats.isDirectory = vi.fn().mockReturnValue(false);
  vi.mocked(fs.stat).mockResolvedValue(mockStats);

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
  ).toEqual<LogsExportError>({ code: 'no-logs-directory' });

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
  mockStats.isDirectory = vi.fn().mockReturnValue(true);
  vi.mocked(fs.stat).mockResolvedValue(mockStats);

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
  ).toEqual<LogsExportError>({ code: 'no-usb-drive' });
});

test('exportLogsToUsb with unknown failure', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});

  const mockStats = new Stats();
  mockStats.isDirectory = vi.fn().mockReturnValue(true);
  vi.mocked(fs.stat).mockResolvedValueOnce(mockStats);

  const cause = new Error('something went wrong');
  execFileMock.mockImplementationOnce(() => {
    throw cause;
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
  ).toEqual<LogsExportError>({ code: 'copy-failed', cause });

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
      message: 'Failed to save logs to usb drive: copy-failed',
      cause: expect.stringContaining('something went wrong'),
    })
  );
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
  mockStats.isDirectory = vi.fn().mockReturnValue(true);
  vi.mocked(fs.stat).mockResolvedValueOnce(mockStats);

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
  expect(vi.mocked(fs.stat)).toHaveBeenCalledWith('/var/log/votingworks');

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

type LogFormat = 'compressed' | 'plain';
const testPlainAndCompressed = test.each<LogFormat>(['plain', 'compressed']);

testPlainAndCompressed('when CDF conversion fails - [$0]', async (fmt) => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.status.reset();
  mockUsbDrive.usbDrive.status.expectRepeatedCallsWith().resolves({
    status: 'mounted',
    mountPoint: '/media/usb-drive',
  });

  const mockStats = new Stats();
  mockStats.isDirectory = vi.fn().mockReturnValue(true);
  vi.mocked(fs.stat).mockResolvedValueOnce(mockStats);
  const readdirMock = fs.readdir as unknown as MockInstance<
    () => Promise<string[]>
  >;
  readdirMock.mockResolvedValue([
    fmt === 'compressed' ? 'vx-logs.log-20240101.gz' : 'vx-logs.log',
  ]);

  const cause = new Error('conversion failed');
  vi.mocked(convertVxLogToCdf).mockImplementation(
    (
      _logWrapper,
      _source,
      _machineId,
      _codeVersion,
      _inputPath,
      _outputPath,
      _compressed,
      cb
    ) => cb(cause)
  );

  const result = await exportLogsToUsb({
    usbDrive: mockUsbDrive.usbDrive,
    logger,
    machineId: 'TEST-MACHINE-ID',
    codeVersion: 'TEST-CODE-VERSION',
    format: 'cdf',
  });
  expect(result.isErr()).toBeTruthy();
  expect(result.err()).toEqual<LogsExportError>({
    code: 'cdf-conversion-failed',
    cause,
  });
});

test('exportLogsToUsb returns error when error filtering fails', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.status.reset();
  mockUsbDrive.usbDrive.status.expectRepeatedCallsWith().resolves({
    status: 'mounted',
    mountPoint: '/media/usb-drive',
  });

  const mockStats = new Stats();
  mockStats.isDirectory = vi.fn().mockReturnValue(true);
  vi.mocked(fs.stat).mockResolvedValueOnce(mockStats);
  const readdirMock = fs.readdir as unknown as MockInstance<
    () => Promise<string[]>
  >;
  readdirMock.mockResolvedValue(['vx-logs.log', 'vx-logs.log-20240101.gz']);

  const cause = 'invalid archive';
  vi.mocked(createReadStream).mockImplementationOnce(() => {
    throw cause;
  });

  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

  const result = await exportLogsToUsb({
    usbDrive: mockUsbDrive.usbDrive,
    logger,
    machineId: 'TEST-MACHINE-ID',
    codeVersion: 'TEST-CODE-VERSION',
    format: 'err',
  });
  expect(result.isErr()).toBeTruthy();
  expect(result.err()).toEqual<LogsExportError>({
    code: 'error-filtering-failed',
    cause,
  });

  expect(logger.log).toHaveBeenCalledWith(
    LogEventId.FileSaved,
    'unknown',
    expect.objectContaining({
      disposition: 'failure',
      message: 'Failed to save logs to usb drive: error-filtering-failed',
      cause: expect.stringContaining('invalid archive'),
    })
  );
});

testPlainAndCompressed('works for CDF format - [$0]', async (fmt) => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.status.reset();
  mockUsbDrive.usbDrive.status.expectRepeatedCallsWith().resolves({
    status: 'mounted',
    mountPoint: '/media/usb-drive',
  });
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();

  const mockStats = new Stats();
  mockStats.isDirectory = vi.fn().mockReturnValue(true);
  vi.mocked(fs.stat).mockResolvedValueOnce(mockStats);
  const readdirMock = fs.readdir as unknown as MockInstance<
    () => Promise<string[]>
  >;

  const inputFilename =
    fmt === 'compressed' ? 'vx-logs.log-20240101.gz' : 'vx-logs.log';
  readdirMock.mockResolvedValue([inputFilename]);

  vi.mocked(convertVxLogToCdf).mockImplementation(
    (
      logWrapper,
      source,
      machineId,
      codeVersion,
      inputPath,
      outputPath,
      compressed,
      cb
    ) => {
      expect(source).toEqual(logger.getSource());
      expect(machineId).toEqual('TEST-MACHINE-ID');
      expect(codeVersion).toEqual('TEST-CODE-VERSION');
      expect(inputPath).toMatch(inputFilename);
      expect(outputPath).toMatch(
        fmt === 'compressed' ? /vx-logs.cdf.json/ : /vx-logs.cdf.log.json$/
      );
      expect(compressed).toEqual(fmt === 'compressed');

      logWrapper(LogEventId.LogConversionToCdfComplete, 'unknown', 'success');
      cb(null);
    }
  );

  expect(
    await exportLogsToUsb({
      usbDrive: mockUsbDrive.usbDrive,
      logger,
      machineId: 'TEST-MACHINE-ID',
      codeVersion: 'TEST-CODE-VERSION',
      format: 'cdf',
    })
  ).toEqual(ok());
  expect(vi.mocked(fs.stat)).toHaveBeenCalledWith('/var/log/votingworks');

  expect(execFileMock).toHaveBeenCalledWith('mkdir', [
    '-p',
    '/media/usb-drive/logs/machine_TEST-MACHINE-ID',
  ]);

  expect(execFileMock).toHaveBeenCalledWith('cp', [
    '-r',
    expect.stringContaining('/tmp/'),
    expect.stringMatching('^/media/usb-drive/logs/machine_TEST-MACHINE-ID/'),
  ]);

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

testPlainAndCompressed('works for error format - [$0]', async (fmt) => {
  const { createReadStream: realCreateReadStream } =
    await vi.importActual<typeof import('node:fs')>('node:fs');
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.usbDrive.status.reset();
  mockUsbDrive.usbDrive.status.expectRepeatedCallsWith().resolves({
    status: 'mounted',
    mountPoint: '/media/usb-drive',
  });
  mockUsbDrive.usbDrive.sync.expectCallWith().resolves();

  const mockStats = new Stats();
  mockStats.isDirectory = vi.fn().mockReturnValue(true);
  vi.mocked(fs.stat).mockResolvedValueOnce(mockStats);
  const readdirMock = fs.readdir as unknown as MockInstance<
    () => Promise<string[]>
  >;

  const compressed = fmt === 'compressed';
  readdirMock.mockResolvedValue([
    compressed ? 'vx-logs.log-20240101.gz' : 'vx-logs.log',
  ]);

  const logFile = makeTemporaryFile({
    content: compressed ? zlib.gzipSync('') : ``,
  });
  vi.mocked(createReadStream).mockReturnValueOnce(
    realCreateReadStream(logFile)
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
  expect(vi.mocked(fs.stat)).toHaveBeenCalledWith('/var/log/votingworks');

  expect(execFileMock).toHaveBeenCalledWith('mkdir', [
    '-p',
    '/media/usb-drive/logs/machine_TEST-MACHINE-ID',
  ]);

  expect(execFileMock).toHaveBeenCalledWith('cp', [
    '-r',
    expect.stringContaining('/tmp/'),
    expect.stringMatching('^/media/usb-drive/logs/machine_TEST-MACHINE-ID/'),
  ]);

  expect(createWriteStream).toHaveBeenCalledWith(
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
