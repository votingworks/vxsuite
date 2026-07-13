import * as fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { MockBatchScanner } from './mock_batch_scanner';
import { ScannedSheetInfo } from './fujitsu_scanner';

function inputSheet(id: number): { frontPath: string; backPath: string } {
  return { frontPath: `/front-${id}.jpg`, backPath: `/back-${id}.jpg` };
}

function scannedSheet(id: number): ScannedSheetInfo {
  return { front: `/front-${id}.jpg`, back: `/back-${id}.jpg` };
}

function createScanner(): MockBatchScanner {
  const dir = mkdtempSync(join(tmpdir(), 'mock-batch-test-'));
  return new MockBatchScanner(join(dir, 'images'));
}

test('initial status checks pass as expected', async () => {
  const scanner = createScanner();
  expect(scanner.isAttached()).toEqual(true);
  expect(await scanner.isImprinterAttached()).toEqual(false);
  expect(scanner.getStatus()).toEqual({ sheetCount: 0 });
});

test('addSheets and getStatus', () => {
  const scanner = createScanner();
  scanner.addSheets([inputSheet(1), inputSheet(2)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 2 });

  scanner.addSheets([inputSheet(3)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 3 });
});

test('imageDir is a writable directory', () => {
  const scanner = createScanner();
  expect(fs.existsSync(scanner.imageDir)).toEqual(true);
  const testFile = join(scanner.imageDir, 'test.txt');
  fs.writeFileSync(testFile, 'hello');
  expect(fs.existsSync(testFile)).toEqual(true);
});

test('constructor cleans up leftover files from a previous run', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mock-batch-test-'));
  const imageDir = join(dir, 'images');
  fs.mkdirSync(imageDir, { recursive: true });
  fs.writeFileSync(join(imageDir, 'old-image.jpg'), 'stale');

  const scanner = new MockBatchScanner(imageDir);
  expect(fs.readdirSync(scanner.imageDir)).toEqual([]);
});

test('scanSheets consumes sheets from the tray', async () => {
  const scanner = createScanner();
  scanner.addSheets([inputSheet(1), inputSheet(2)]);

  const batch = scanner.scanSheets();
  expect(scanner.getStatus()).toEqual({ sheetCount: 2 });

  expect(await batch.scanSheet()).toEqual(scannedSheet(1));
  expect(scanner.getStatus()).toEqual({ sheetCount: 1 });
  expect(await batch.scanSheet()).toEqual(scannedSheet(2));
  expect(scanner.getStatus()).toEqual({ sheetCount: 0 });
  expect(await batch.scanSheet()).toBeUndefined();
});

test('sheets left in the tray when a session ends stay for the next session', async () => {
  const scanner = createScanner();
  scanner.addSheets([inputSheet(1), inputSheet(2)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(scannedSheet(1));
  await batch1.endBatch();
  expect(scanner.getStatus()).toEqual({ sheetCount: 1 });

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toEqual(scannedSheet(2));
  expect(await batch2.scanSheet()).toBeUndefined();
});

test('scanSheets with empty queue returns no sheets', async () => {
  const scanner = createScanner();
  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toBeUndefined();
});

test('endBatch stops returning sheets', async () => {
  const scanner = createScanner();
  scanner.addSheets([inputSheet(1), inputSheet(2)]);

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toEqual(scannedSheet(1));
  await batch.endBatch();
  expect(await batch.scanSheet()).toBeUndefined();
});

test('addSheets reloads the tray for the next scan', async () => {
  const scanner = createScanner();
  scanner.addSheets([inputSheet(1)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(scannedSheet(1));
  expect(await batch1.scanSheet()).toBeUndefined();

  scanner.addSheets([inputSheet(2)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 1 });

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toEqual(scannedSheet(2));
  expect(await batch2.scanSheet()).toBeUndefined();
});

test('clearSheets resets so next scan returns nothing', async () => {
  const scanner = createScanner();
  const testFile = join(scanner.imageDir, 'test.jpg');
  fs.writeFileSync(testFile, 'data');
  scanner.addSheets([inputSheet(1), inputSheet(2)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(scannedSheet(1));

  scanner.clearSheets();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0 });

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toBeUndefined();

  expect(fs.readdirSync(scanner.imageDir)).toEqual([]);
  expect(fs.existsSync(scanner.imageDir)).toEqual(true);
});
