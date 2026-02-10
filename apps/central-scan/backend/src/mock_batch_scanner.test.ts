import * as fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'vitest';
import { MockBatchScanner } from './mock_batch_scanner';
import { ScannedSheetInfo } from './fujitsu_scanner';

function sheet(id: number): ScannedSheetInfo {
  return { frontPath: `/front-${id}.jpg`, backPath: `/back-${id}.jpg` };
}

function createScanner(): MockBatchScanner {
  const dir = mkdtempSync(join(tmpdir(), 'mock-batch-test-'));
  return new MockBatchScanner(join(dir, 'images'));
}

test('isAttached returns true', () => {
  const scanner = createScanner();
  expect(scanner.isAttached()).toEqual(true);
});

test('isImprinterAttached returns false', async () => {
  const scanner = createScanner();
  expect(await scanner.isImprinterAttached()).toEqual(false);
});

test('initial status has zero sheets', () => {
  const scanner = createScanner();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0 });
});

test('addSheets and getStatus', () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1), sheet(2)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 2 });

  scanner.addSheets([sheet(3)]);
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

test('clearSheets empties the queue and cleans up image files', () => {
  const scanner = createScanner();
  const testFile = join(scanner.imageDir, 'test.jpg');
  fs.writeFileSync(testFile, 'data');
  scanner.addSheets([sheet(1), sheet(2)]);
  scanner.clearSheets();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0 });
});

test('scanSheets returns sheets and preserves the queue', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1), sheet(2)]);

  const batch = scanner.scanSheets();
  expect(scanner.getStatus()).toEqual({ sheetCount: 2 });

  expect(await batch.scanSheet()).toEqual(sheet(1));
  expect(await batch.scanSheet()).toEqual(sheet(2));
  expect(await batch.scanSheet()).toBeUndefined();
});

test('sheets can be scanned repeatedly without reloading', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(sheet(1));
  expect(await batch1.scanSheet()).toBeUndefined();

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toEqual(sheet(1));
  expect(await batch2.scanSheet()).toBeUndefined();
});

test('scanSheets with empty queue returns no sheets', async () => {
  const scanner = createScanner();
  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toBeUndefined();
});

test('endBatch stops returning sheets', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1), sheet(2)]);

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toEqual(sheet(1));
  await batch.endBatch();
  expect(await batch.scanSheet()).toBeUndefined();
});

test('addSheets appends to existing queue for next scan', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(sheet(1));
  expect(await batch1.scanSheet()).toBeUndefined();

  scanner.addSheets([sheet(2)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 2 });

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toEqual(sheet(1));
  expect(await batch2.scanSheet()).toEqual(sheet(2));
  expect(await batch2.scanSheet()).toBeUndefined();
});

test('clearSheets resets so next scan returns nothing', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1), sheet(2)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(sheet(1));

  scanner.clearSheets();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0 });

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toBeUndefined();
});
