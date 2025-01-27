import { beforeEach, expect, MockedFunction, test, vi } from 'vitest';
import { BaseLogger, LogSource } from '@votingworks/logging';
import { HmpbBallotPaperSize } from '@votingworks/types';
import { ChildProcess } from 'node:child_process';
import { Device, isDeviceAttached } from '@votingworks/backend';
import { sleep } from '@votingworks/basics';
import {
  EXPECTED_IMPRINTER_UNATTACHED_ERROR,
  FUJITSU_VENDOR_ID,
  FujitsuScanner,
  ScannerMode,
} from './fujitsu_scanner';
import { makeMockChildProcess } from '../test/util/mocks';
import { streamExecFile } from './exec';

vi.mock(import('@votingworks/backend'), async (importActual) => ({
  ...(await importActual()),
  isDeviceAttached: vi.fn(),
}));

const isDeviceAttachedMock = vi.mocked(isDeviceAttached);

vi.mock(import('./exec.js'));

beforeEach(() => {
  vi.clearAllMocks();
});

const exec = streamExecFile as unknown as MockedFunction<
  (file: string, args: readonly string[]) => ChildProcess
>;

test('fujitsu scanner calls scanimage with fujitsu device type', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  const sheets = scanner.scanSheets();

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  scanimage.stdout.append('/tmp/image-0001.png\n');
  scanimage.stdout.append('/tmp/image-0002.png\n');
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--device-name', 'fujitsu'])
  );

  scanimage.emit('exit', 0, null);
  await expect(sheets.scanSheet()).resolves.toEqual({
    frontPath: '/tmp/image-0001.png',
    backPath: '/tmp/image-0002.png',
  });
  await expect(sheets.scanSheet()).resolves.toBeUndefined();
});

test('fujitsu scanner returns ballot audit id on scans when imprinting', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  const sheets = scanner.scanSheets({ imprintIdPrefix: 'test-batch' });

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  scanimage.stdout.append('/tmp/image-0001.png\n');
  scanimage.stdout.append('/tmp/image-0002.png\n');
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--device-name', 'fujitsu'])
  );

  scanimage.emit('exit', 0, null);
  await expect(sheets.scanSheet()).resolves.toEqual({
    frontPath: '/tmp/image-0001.png',
    backPath: '/tmp/image-0002.png',
    ballotAuditId: 'test-batch_0000',
  });
  await expect(sheets.scanSheet()).resolves.toBeUndefined();
});

test('fujitsu scanner can scans with expected params on letter size election', () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets({ pageSize: HmpbBallotPaperSize.Letter });

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining([
      '--page-width',
      '215.9',
      '--page-height',
      '336.55',
      '--bgcolor=black',
    ])
  );
});

test('fujitsu scanner can scan with expected params on legal size election', () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets({ pageSize: HmpbBallotPaperSize.Legal });

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining([
      '--page-width',
      '215.9',
      '--page-height',
      '361.95',
      '--bgcolor=black',
    ])
  );
});

test('fujitsu scanner does not specify a mode by default', () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets();

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  expect(exec).not.toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--mode'])
  );
});

test('fujitsu scanner does not imprint by default', () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets();

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  expect(exec).not.toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--endorser=yes'])
  );
  expect(exec).not.toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--endorser-string'])
  );
});

test('fujitsu scanner does imprint as expected when given an imprint ID prefix', () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets({
    imprintIdPrefix: 'TEST-BATCH-ID',
  });

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--endorser=yes'])
  );

  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--endorser-string', 'TEST-BATCH-ID_%04ud'])
  );
});

test('fujitsu scanner can scan with lineart mode', () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
    mode: ScannerMode.Lineart,
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets();

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--mode', 'lineart'])
  );
});

test('fujitsu scanner can scan with gray mode', () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
    mode: ScannerMode.Gray,
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets();

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--mode', 'gray'])
  );
});

test('fujitsu scanner can scan with color mode', () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
    mode: ScannerMode.Color,
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets();

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--mode', 'color'])
  );
});

test('fujitsu scanner requests two images at a time from scanimage', async () => {
  const scanimage = makeMockChildProcess();
  const stdinWrite = vi.spyOn(scanimage.stdin, 'write');
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  const sheets = scanner.scanSheets();

  scanimage.stderr.append(
    [
      'Scanning infinity pages, incrementing by 1, numbering from 1\n',
      'Place document no. 1 on the scanner.\n',
      'Press <RETURN> to continue.\n',
      'Press Ctrl + D to terminate.\n',
    ].join('')
  );
  // scanimage.stdout.append('/tmp/image-0001.png\n')
  // scanimage.stdout.append('/tmp/image-0002.png\n')
  expect(exec).toHaveBeenCalledWith(
    'scanimage',
    expect.arrayContaining(['--device-name', 'fujitsu'])
  );

  expect(stdinWrite).not.toHaveBeenCalled();
  const sheetPromise = sheets.scanSheet();
  expect(stdinWrite).toHaveBeenCalledWith('\n\n');

  scanimage.stdout.append('/tmp/front.png\n');
  scanimage.stdout.append('/tmp/back.png\n');
  await expect(sheetPromise).resolves.toEqual({
    frontPath: '/tmp/front.png',
    backPath: '/tmp/back.png',
  });
});

test('fujitsu scanner ends the scanimage process on generator return', async () => {
  const scanimage = makeMockChildProcess();
  const stdinEnd = vi.spyOn(scanimage.stdin, 'end');
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });
  exec.mockReturnValueOnce(scanimage);
  const sheets = scanner.scanSheets();

  // we haven't already ended it…
  expect(stdinEnd).not.toHaveBeenCalled();

  // tell `scanimage` to exit
  await sheets.endBatch();
  expect(stdinEnd).toHaveBeenCalledTimes(1);

  // ending the batch again does nothing
  await sheets.endBatch();
  expect(stdinEnd).toHaveBeenCalledTimes(1);
});

test('fujitsu scanner fails if scanSheet fails', async () => {
  const scanimage = makeMockChildProcess();
  exec.mockReturnValueOnce(scanimage);
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });
  const sheets = scanner.scanSheets();

  scanimage.emit('exit', 1, null);
  await expect(sheets.scanSheet()).rejects.toThrowError();
});

test('attached based on detected USB devices', () => {
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  isDeviceAttachedMock.mockReturnValue(true);
  expect(scanner.isAttached()).toEqual(true);

  isDeviceAttachedMock.mockReturnValue(false);
  expect(scanner.isAttached()).toEqual(false);

  const isDeviceFn = isDeviceAttachedMock.mock.calls[0][0];

  expect(
    isDeviceFn({
      deviceDescriptor: {
        idVendor: FUJITSU_VENDOR_ID,
      },
    } as unknown as Device)
  ).toEqual(true);

  expect(
    isDeviceFn({
      deviceDescriptor: {
        idVendor: 0x0000,
      },
    } as unknown as Device)
  ).toEqual(false);
});

test('fujitsu scanner calls scanimage to determine if imprinter is attached', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  const isImprinterAttachedPromise = scanner.isImprinterAttached();
  scanimage.emit('close', 0, null);
  await expect(isImprinterAttachedPromise).resolves.toEqual(true);
});

test('fujitsu scanner calls scanimage to determine if imprinter is attached handles unattached state as expected', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  const isImprinterAttachedPromise = scanner.isImprinterAttached();
  const chunks = [
    'some text\n',
    // intentionally split the error message across chunks
    EXPECTED_IMPRINTER_UNATTACHED_ERROR.slice(0, 10),
    EXPECTED_IMPRINTER_UNATTACHED_ERROR.slice(10),
    '\n',
    'some more text\n',
  ];

  for (const chunk of chunks) {
    scanimage.stderr.append(chunk);
  }

  // ensure we don't resolve until the process has exited
  let hasResolved = false;
  void isImprinterAttachedPromise.then(() => {
    hasResolved = true;
  });
  await sleep(10);
  expect(hasResolved).toEqual(false);
  scanimage.emit('close', 0, null);

  // now we should have resolved
  await expect(isImprinterAttachedPromise).resolves.toEqual(false);
  expect(hasResolved).toEqual(true);
});
