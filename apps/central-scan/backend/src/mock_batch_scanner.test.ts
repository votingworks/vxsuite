import * as fs from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { MockBatchScanner } from './mock_batch_scanner.js';
import { ScannedSheetInfo } from './fujitsu_scanner.js';

function sheet(id: number): ScannedSheetInfo {
  return { frontPath: `/front-${id}.jpg`, backPath: `/back-${id}.jpg` };
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
  scanner.addSheets([sheet(1), sheet(2)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 2, errorQueued: false });

  scanner.addSheets([sheet(3)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 3, errorQueued: false });
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

test('scanSheets consumes the queue as it scans', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1), sheet(2)]);

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toEqual(sheet(1));
  expect(scanner.getStatus()).toEqual({ sheetCount: 1, errorQueued: false });

  expect(await batch.scanSheet()).toEqual(sheet(2));
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: false });

  expect(await batch.scanSheet()).toBeUndefined();
});

test('scanned sheets are not scanned again in the next session', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(sheet(1));
  expect(await batch1.scanSheet()).toBeUndefined();

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toBeUndefined();
});

test('unscanned sheets stay in the tray for the next session', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1), sheet(2), sheet(3)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(sheet(1));
  await batch1.endBatch();
  expect(scanner.getStatus()).toEqual({ sheetCount: 2, errorQueued: false });

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toEqual(sheet(2));
  expect(await batch2.scanSheet()).toEqual(sheet(3));
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

test('addSheets refills the tray for the next scan', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(sheet(1));
  expect(await batch1.scanSheet()).toBeUndefined();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: false });

  scanner.addSheets([sheet(2)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 1, errorQueued: false });

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toEqual(sheet(2));
  expect(await batch2.scanSheet()).toBeUndefined();
});

test('setCopies scales the queued sheets', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1), sheet(2)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 2, errorQueued: false });

  scanner.setCopies(3);
  expect(scanner.getStatus()).toEqual({ sheetCount: 6, errorQueued: false });

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toEqual(sheet(1));
  expect(await batch.scanSheet()).toEqual(sheet(1));
  expect(scanner.getStatus()).toEqual({ sheetCount: 4, errorQueued: false });

  expect(await batch.scanSheet()).toEqual(sheet(1));
  expect(scanner.getStatus()).toEqual({ sheetCount: 3, errorQueued: false });

  expect(await batch.scanSheet()).toEqual(sheet(2));
  expect(await batch.scanSheet()).toEqual(sheet(2));
  expect(await batch.scanSheet()).toEqual(sheet(2));
  expect(await batch.scanSheet()).toBeUndefined();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: false });
});

test('a queued error makes the next scan attempt fail once', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1), sheet(2), sheet(3)]);

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toEqual(sheet(1));

  scanner.setErrorQueued(true);
  expect(scanner.getStatus()).toEqual({ sheetCount: 2, errorQueued: true });
  await expect(batch.scanSheet()).rejects.toThrowError(
    'simulated scanner error'
  );

  // the error is consumed; scanning resumes, whether on the same session or a
  // fresh one
  expect(scanner.getStatus()).toEqual({ sheetCount: 2, errorQueued: false });
  expect(await batch.scanSheet()).toEqual(sheet(2));
  await batch.endBatch();

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toEqual(sheet(3));
});

test('setErrorQueued(false) cancels a queued error', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1)]);
  scanner.setErrorQueued(true);
  expect(scanner.getStatus()).toEqual({ sheetCount: 1, errorQueued: true });

  scanner.setErrorQueued(false);
  expect(scanner.getStatus()).toEqual({ sheetCount: 1, errorQueued: false });

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toEqual(sheet(1));
});

test('clearSheets clears a queued error', () => {
  const scanner = createScanner();
  scanner.setErrorQueued(true);
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: true });

  scanner.clearSheets();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: false });
});

test('clearSheets resets so next scan returns nothing', async () => {
  const scanner = createScanner();
  const testFile = join(scanner.imageDir, 'test.jpg');
  fs.writeFileSync(testFile, 'data');
  scanner.addSheets([sheet(1), sheet(2)]);

  const batch1 = scanner.scanSheets();
  expect(await batch1.scanSheet()).toEqual(sheet(1));

  scanner.clearSheets();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: false });

  const batch2 = scanner.scanSheets();
  expect(await batch2.scanSheet()).toBeUndefined();

  expect(fs.readdirSync(scanner.imageDir)).toEqual([]);
  expect(fs.existsSync(scanner.imageDir)).toEqual(true);
});

test('copies left unscanned when a session ends are scanned in the next session', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1), sheet(2)]);
  scanner.setCopies(3);

  const firstBatch = scanner.scanSheets();
  expect(await firstBatch.scanSheet()).toEqual(sheet(1));
  await firstBatch.endBatch();
  expect(scanner.getStatus()).toEqual({ sheetCount: 5, errorQueued: false });

  const secondBatch = scanner.scanSheets();
  expect(await secondBatch.scanSheet()).toEqual(sheet(1));
  expect(await secondBatch.scanSheet()).toEqual(sheet(1));
  expect(await secondBatch.scanSheet()).toEqual(sheet(2));
  expect(scanner.getStatus()).toEqual({ sheetCount: 2, errorQueued: false });
});

test('lowering copies below those already scanned finishes the current sheet', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1), sheet(2)]);
  scanner.setCopies(3);

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toEqual(sheet(1));
  expect(await batch.scanSheet()).toEqual(sheet(1));
  scanner.setCopies(2);
  expect(scanner.getStatus()).toEqual({ sheetCount: 2, errorQueued: false });

  expect(await batch.scanSheet()).toEqual(sheet(2));
  expect(await batch.scanSheet()).toEqual(sheet(2));
  expect(await batch.scanSheet()).toBeUndefined();
});

test('clearSheets resets partially scanned copies', async () => {
  const scanner = createScanner();
  scanner.addSheets([sheet(1)]);
  scanner.setCopies(3);

  const batch = scanner.scanSheets();
  expect(await batch.scanSheet()).toEqual(sheet(1));
  scanner.clearSheets();
  expect(scanner.getStatus()).toEqual({ sheetCount: 0, errorQueued: false });

  scanner.addSheets([sheet(2)]);
  expect(scanner.getStatus()).toEqual({ sheetCount: 3, errorQueued: false });
  expect(await scanner.scanSheets().scanSheet()).toEqual(sheet(2));
});
