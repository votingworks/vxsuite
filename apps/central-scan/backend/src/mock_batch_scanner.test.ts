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
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: false });
});

test('addSheets and getStatus', () => {
  const scanner = createScanner();
  scanner.addSheets([inputSheet(1), inputSheet(2)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 2, errorQueued: false });

  scanner.addSheets([inputSheet(3)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 3, errorQueued: false });
});

test('sheetCopies loads each added sheet multiple times', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mock-batch-test-'));
  const scanner = new MockBatchScanner(join(dir, 'images'), 3);

  scanner.addSheets([inputSheet(1), inputSheet(2)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 6, errorQueued: false });

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toEqual(scannedSheet(1));
  expect(await batch.scanSheet()).toEqual(scannedSheet(1));
  expect(await batch.scanSheet()).toEqual(scannedSheet(1));
  expect(await batch.scanSheet()).toEqual(scannedSheet(2));
  expect(await batch.scanSheet()).toEqual(scannedSheet(2));
  expect(await batch.scanSheet()).toEqual(scannedSheet(2));
  expect(await batch.scanSheet()).toBeUndefined();
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
  expect(scanner.getStatus()).toEqual({ sheetCount: 2, errorQueued: false });

  expect(await batch.scanSheet()).toEqual(scannedSheet(1));
  expect(scanner.getStatus()).toEqual({ sheetCount: 1, errorQueued: false });
  expect(await batch.scanSheet()).toEqual(scannedSheet(2));
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: false });
  expect(await batch.scanSheet()).toBeUndefined();
});

test('sheets left in the tray when a session ends stay for the next session', async () => {
  const scanner = createScanner();
  scanner.addSheets([inputSheet(1), inputSheet(2)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(scannedSheet(1));
  await batch1.endBatch();
  expect(scanner.getStatus()).toEqual({ sheetCount: 1, errorQueued: false });

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
  expect(scanner.getStatus()).toEqual({ sheetCount: 1, errorQueued: false });

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toEqual(scannedSheet(2));
  expect(await batch2.scanSheet()).toBeUndefined();
});

test('simulateError makes the next scan attempt fail once', async () => {
  const scanner = createScanner();
  scanner.addSheets([inputSheet(1), inputSheet(2)]);

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toEqual(scannedSheet(1));

  scanner.simulateError();
  expect(scanner.getStatus()).toEqual({ sheetCount: 1, errorQueued: true });
  await expect(batch.scanSheet()).rejects.toThrowError(
    'simulated scanner error'
  );

  // the error is consumed; scanning resumes with the remaining sheets, whether
  // on the same session or a fresh one (a continued batch)
  expect(scanner.getStatus()).toEqual({ sheetCount: 1, errorQueued: false });
  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toEqual(scannedSheet(2));
  expect(await batch2.scanSheet()).toBeUndefined();
});

test('clearSheets clears a queued error', () => {
  const scanner = createScanner();
  scanner.simulateError();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: true });

  scanner.clearSheets();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: false });
});

test('clearSheets resets so next scan returns nothing', async () => {
  const scanner = createScanner();
  const testFile = join(scanner.imageDir, 'test.jpg');
  fs.writeFileSync(testFile, 'data');
  scanner.addSheets([inputSheet(1), inputSheet(2)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(scannedSheet(1));

  scanner.clearSheets();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: false });

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toBeUndefined();

  expect(fs.readdirSync(scanner.imageDir)).toEqual([]);
  expect(fs.existsSync(scanner.imageDir)).toEqual(true);
});
