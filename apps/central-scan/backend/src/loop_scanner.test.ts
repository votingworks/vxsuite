import { expect, test } from 'vitest';
import { readFileSync, writeFileSync } from 'fs-extra';
import { join } from 'node:path';
import { fileSync } from 'tmp';
import { LoopScanner, parseBatches, parseBatchesFromEnv } from './loop_scanner';
import { ScannedSheetInfo } from './fujitsu_scanner';

function readFiles(sheetInfo: ScannedSheetInfo): string[] {
  return [sheetInfo.frontPath, sheetInfo.backPath].map((path) =>
    readFileSync(path, 'utf8')
  );
}

test('copies files in pairs', async () => {
  const [f1, f2, f3, f4] = Array.from({ length: 4 }, (_, i) => {
    const path = fileSync().name;
    writeFileSync(path, (i + 1).toString(), 'utf8');
    return path;
  });
  const scanner = new LoopScanner([
    [{ frontPath: f1, backPath: f2 }],
    [{ frontPath: f3, backPath: f4 }],
  ]);

  expect(readFiles((await scanner.scanSheets().scanSheet())!)).toEqual([
    '1',
    '2',
  ]);
  expect(readFiles((await scanner.scanSheets().scanSheet())!)).toEqual([
    '3',
    '4',
  ]);
  expect(readFiles((await scanner.scanSheets().scanSheet())!)).toEqual([
    '1',
    '2',
  ]);
});

test('parses an inline manifest from an environment variable', () => {
  expect(parseBatchesFromEnv('01.png,02.png,03.png,04.png')).toEqual([
    [
      { frontPath: '01.png', backPath: '02.png' },
      { frontPath: '03.png', backPath: '04.png' },
    ],
  ]);
});

test('interprets relative file paths in a manifest file as relative to the file', () => {
  const manifestPath = fileSync().name;
  writeFileSync(manifestPath, '01.png\n02.png\n03.png\n04.png', 'utf8');
  expect(parseBatchesFromEnv(`@${manifestPath}`)).toEqual([
    [
      {
        frontPath: join(manifestPath, '..', '01.png'),
        backPath: join(manifestPath, '..', '02.png'),
      },
      {
        frontPath: join(manifestPath, '..', '03.png'),
        backPath: join(manifestPath, '..', '04.png'),
      },
    ],
  ]);
});

test('preserves absolute paths in a manifest file', () => {
  const manifestPath = fileSync().name;
  writeFileSync(manifestPath, '/01.png\n/02.png\n/03.png\n/04.png', 'utf8');
  expect(parseBatchesFromEnv(`@${manifestPath}`)).toEqual([
    [
      { frontPath: '/01.png', backPath: '/02.png' },
      { frontPath: '/03.png', backPath: '/04.png' },
    ],
  ]);
});

test('interprets multiple path separators in a row as a batch separator', () => {
  expect(parseBatchesFromEnv('01.png,02.png,,,03.png,04.png')).toEqual([
    [{ frontPath: '01.png', backPath: '02.png' }],
    [{ frontPath: '03.png', backPath: '04.png' }],
  ]);
});

test('ignores comments', () => {
  expect(parseBatches(['# comment', '01.png', '02.png'])).toEqual([
    [{ frontPath: '01.png', backPath: '02.png' }],
  ]);
});

test('always attached', () => {
  expect(new LoopScanner([]).isAttached()).toEqual(true);
});

test('does not support imprinting', async () => {
  expect(await new LoopScanner([]).isImprinterAttached()).toEqual(false);
});
