import { Logger, LogSource } from '@votingworks/logging';
import { BallotPaperSize } from '@votingworks/types';
import { ScannerStatus } from '@votingworks/types/api/services/scan';
import { ChildProcess } from 'child_process';
import { FujitsuScanner, ScannerMode } from '.';
import { makeMockChildProcess } from '../../test/util/mocks';
import { streamExecFile } from '../exec';

jest.mock('../exec');

const exec = (streamExecFile as unknown) as jest.MockedFunction<
  (file: string, args: readonly string[]) => ChildProcess
>;

test('fujitsu scanner calls scanimage with fujitsu device type', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new Logger(LogSource.VxScanService),
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

test('fujitsu scanner can scan with letter size', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new Logger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets({ paperSize: BallotPaperSize.Letter });

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
    expect.arrayContaining(['--page-height'])
  );
});

test('fujitsu scanner can scan with legal size', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new Logger(LogSource.VxScanService),
  });

  exec.mockReturnValueOnce(scanimage);
  scanner.scanSheets({ paperSize: BallotPaperSize.Legal });

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
    expect.arrayContaining(['--page-height'])
  );
});

test('fujitsu scanner does not specify a mode by default', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new Logger(LogSource.VxScanService),
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

test('fujitsu scanner can scan with lineart mode', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new Logger(LogSource.VxScanService),
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

test('fujitsu scanner can scan with gray mode', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new Logger(LogSource.VxScanService),
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

test('fujitsu scanner can scan with color mode', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new Logger(LogSource.VxScanService),
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
    logger: new Logger(LogSource.VxScanService),
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
    logger: new Logger(LogSource.VxScanService),
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
    logger: new Logger(LogSource.VxScanService),
  });
  const sheets = scanner.scanSheets();

  scanimage.emit('exit', 1, null);
  await expect(sheets.scanSheet()).rejects.toThrowError();
});

test('fujitsu scanner status is always unknown', async () => {
  const scanner = new FujitsuScanner({
    logger: new Logger(LogSource.VxScanService),
  });
  expect(await scanner.getStatus()).toEqual(ScannerStatus.Unknown);
});

test('fujitsu scanner accept/reject/review are no-ops', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new Logger(LogSource.VxScanService),
  });
  exec.mockReturnValueOnce(scanimage);
  const sheets = scanner.scanSheets();

  expect(await sheets.acceptSheet()).toEqual(true);
  expect(await sheets.rejectSheet()).toEqual(false);
  expect(await sheets.reviewSheet()).toEqual(false);
});

test('fujitsu scanner calibrate is a no-op', async () => {
  const scanner = new FujitsuScanner({
    logger: new Logger(LogSource.VxScanService),
  });
  expect(await scanner.calibrate()).toEqual(false);
});
