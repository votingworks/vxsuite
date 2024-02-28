import { BaseLogger, LogSource } from '@votingworks/logging';
import { BallotPaperSize } from '@votingworks/types';
import { ChildProcess } from 'child_process';
import { FujitsuScanner, ScannerMode } from './fujitsu_scanner';
import { makeMockChildProcess } from '../test/util/mocks';
import { streamExecFile } from './exec';

jest.mock('./exec');

const exec = streamExecFile as unknown as jest.MockedFunction<
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

test('fujitsu scanner accept/reject/review are no-ops', async () => {
  const scanimage = makeMockChildProcess();
  const scanner = new FujitsuScanner({
    logger: new BaseLogger(LogSource.VxScanService),
  });
  exec.mockReturnValueOnce(scanimage);
  const sheets = scanner.scanSheets();

  expect(await sheets.acceptSheet()).toEqual(true);
  expect(await sheets.rejectSheet()).toEqual(false);
  expect(await sheets.reviewSheet()).toEqual(false);
});
