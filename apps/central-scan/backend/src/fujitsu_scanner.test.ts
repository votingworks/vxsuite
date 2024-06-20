import { BaseLogger, LogSource } from '@votingworks/logging';
import { BallotPaperSize } from '@votingworks/types';
import { ChildProcess } from 'child_process';
import { mockOf } from '@votingworks/test-utils';
import { Device, isDeviceAttached } from '@votingworks/backend';
import {
  EXPECTED_IMPRINTER_UNATTACHED_ERROR,
  FUJITSU_VENDOR_ID,
  FujitsuScanner,
  ScannerMode,
} from './fujitsu_scanner';
import { makeMockChildProcess } from '../test/util/mocks';
import { streamExecFile } from './exec';

jest.mock(
  '@votingworks/backend',
  (): typeof import('@votingworks/backend') => ({
    ...jest.requireActual('@votingworks/backend'),
    isDeviceAttached: jest.fn(),
  })
);

const isDeviceAttachedMock = mockOf(isDeviceAttached);

jest.mock('./exec');

const exec = streamExecFile as unknown as jest.MockedFunction<
  (file: string, args: readonly string[]) => ChildProcess
>;

// TODO(CARO) - test with imprint prefix defined and undefined

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
    expect.arrayContaining(['-d', 'fujitsu'])
  );

  scanimage.emit('exit', 0, null);
  await expect(sheets.scanSheet()).resolves.toEqual([
    '/tmp/image-0001.png',
    '/tmp/image-0002.png',
  ]);
  await expect(sheets.scanSheet()).resolves.toBeUndefined();
});

test('fujitsu scanner can scan with letter size', () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets({ pageSize: BallotPaperSize.Letter });

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
      '215.872',
      '--page-height',
      '279.364',
    ])
  );
});

test('fujitsu scanner can scan with legal size', () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets({ pageSize: BallotPaperSize.Legal });

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
      '215.872',
      '--page-height',
      '355.554',
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
    expect.arrayContaining(['--endorser-string', 'TEST-BATCH-ID_%04d'])
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
    expect.arrayContaining(['-d', 'fujitsu'])
  );

  expect(scanimage.stdin?.write).not.toHaveBeenCalled();
  const sheetPromise = sheets.scanSheet();
  expect(scanimage.stdin?.write).toHaveBeenCalledWith('\n\n');

  scanimage.stdout.append('/tmp/front.png\n');
  scanimage.stdout.append('/tmp/back.png\n');
  await expect(sheetPromise).resolves.toEqual([
    '/tmp/front.png',
    '/tmp/back.png',
  ]);
});

test('fujitsu scanner ends the scanimage process on generator return', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });
  exec.mockReturnValueOnce(scanimage);
  const sheets = scanner.scanSheets();

  // we haven't already ended it…
  expect(scanimage.stdin?.end).not.toHaveBeenCalled();

  // tell `scanimage` to exit
  await sheets.endBatch();
  expect(scanimage.stdin?.end).toHaveBeenCalledTimes(1);

  // ending the batch again does nothing
  await sheets.endBatch();
  expect(scanimage.stdin?.end).toHaveBeenCalledTimes(1);
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
  const isImprinterAttached = scanner.isImprinterAttached();
  scanimage.emit('close', 0, null);
  await expect(isImprinterAttached).resolves.toEqual(true);
});

test('fujitsu scanner calls scanimage to determine if imprinter is attached handles unattached state as expected', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  const isImprinterAttached = scanner.isImprinterAttached();
  scanimage.stderr.append(
    `some text ${EXPECTED_IMPRINTER_UNATTACHED_ERROR} more text`
  );
  scanimage.emit('close', 0, null);
  await expect(isImprinterAttached).resolves.toEqual(false);
});
