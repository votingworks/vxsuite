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
import { tmpNameSync } from 'tmp';
import { PassThrough } from 'node:stream';
import { ok } from '@votingworks/basics';
import { convertVxLogToCdf } from '@votingworks/logging-utils';
import { execFile } from '../exec';
import { exportLogsToUsb } from './export_logs_to_usb';

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
  ).toEqual('no-logs-directory');

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
  ).toEqual('no-usb-drive');
});

test('exportLogsToUsb with unknown failure', async () => {
  const mockUsbDrive = createMockUsbDrive();
  mockUsbDrive.insertUsbDrive({});

  const mockStats = new Stats();
  mockStats.isDirectory = vi.fn().mockReturnValue(true);
  vi.mocked(fs.stat).mockResolvedValueOnce(mockStats);

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

test('exportLogsToUsb returns error when cdf conversion fails - compressed file', async () => {
  const { createReadStream: realCreateReadStream } =
    await vi.importActual<typeof import('node:fs')>('node:fs');
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
  readdirMock.mockResolvedValue(['vx-logs.log-20240101.gz']);

  const logFile = tmpNameSync();
  await fs.writeFile(logFile, ``);
  vi.mocked(createReadStream).mockReturnValueOnce(
    realCreateReadStream(logFile, 'utf8')
  );
  // There will be an error uncompressing if this is an empty file
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

test('exportLogsToUsb returns error when cdf conversion fails - plain file', async () => {
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
  readdirMock.mockResolvedValue(['vx-logs.log']);

  const logFile = tmpNameSync();
  await fs.writeFile(logFile, ``);

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
    ) => cb(new Error('conversion failed'))
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
  const { createReadStream: realCreateReadStream } =
    await vi.importActual<typeof import('node:fs')>('node:fs');
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

  const logFile = tmpNameSync();
  await fs.writeFile(logFile, ``);
  vi.mocked(createReadStream).mockReturnValueOnce(
    realCreateReadStream(logFile, 'utf8')
  );
  // There will be an error uncompressing if this is an empty file
  vi.mocked(createReadStream).mockReturnValueOnce(
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
  readdirMock.mockResolvedValue(['vx-logs.log']);

  const logFile = tmpNameSync();
  await fs.writeFile(logFile, ``);
  vi.mocked(createReadStream).mockReturnValueOnce(
    realCreateReadStream(logFile, 'utf8')
  );

  execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

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
      expect(inputPath).toMatch(/vx-logs.log$/);
      expect(outputPath).toMatch(/vx-logs.cdf.log.json$/);
      expect(compressed).toEqual(false);

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

test('exportLogsToUsb works for error format when all conditions are met', async () => {
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
  readdirMock.mockResolvedValue(['vx-logs.log']);

  const logFile = tmpNameSync();
  await fs.writeFile(logFile, ``);
  vi.mocked(createReadStream).mockReturnValueOnce(
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
