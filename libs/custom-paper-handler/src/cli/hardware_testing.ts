/* eslint-disable no-console */
// Waits for manual paper load then prints and scans in a loop

import { assert, assertDefined, iter, sleep } from '@votingworks/basics';
import { Buffer } from 'node:buffer';
import { pdfToImages } from '@votingworks/image-utils';
import { tmpNameSync } from 'tmp';
import {
  getPaperHandlerDriver,
  isCoverOpen,
  isPaperInScanner,
  isPaperJammed,
  isPaperReadyToLoad,
  PaperHandlerDriverInterface,
  ScanDirection,
} from '../driver';
import { chunkBinaryBitmap, imageDataToBinaryBitmap } from '../printing';

const POLL_INTERVAL_MS = 250;
const POLL_LOG_INTERVAL = 3000;
const STRESS_TEST_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const SCAN_DPI = 72;
const PRINT_DPI = 200;
const VERTICAL_DOTS_IN_CHUNK = 24;

// TODO replace with desired test PDF
const testPdf = Buffer.of(123);

// Closely adapted from MarkScasn's application_driver
async function chunkAndPrintPdf(
  driver: PaperHandlerDriverInterface,
  pdfData: Buffer
): Promise<void> {
  const pageInfo = await iter(
    pdfToImages(pdfData, { scale: PRINT_DPI / SCAN_DPI })
  ).first();
  // A PDF must have at least 1 page but iter doesn't know this.
  // `pdfData` of length 0 will fail in `pdfToImages`.
  assert(pageInfo);
  assert(
    pageInfo.pageCount === 1,
    `Unexpected page count ${pageInfo.pageCount}`
  );
  const { page } = pageInfo;

  const ballotBinaryBitmap = imageDataToBinaryBitmap(page, {});
  const customChunkedBitmaps = chunkBinaryBitmap(ballotBinaryBitmap);

  let dotsSkipped = 0;
  for (const customChunkedBitmap of customChunkedBitmaps) {
    if (customChunkedBitmap.empty) {
      dotsSkipped += VERTICAL_DOTS_IN_CHUNK;
    } else {
      if (dotsSkipped) {
        await driver.setRelativeVerticalPrintPosition(dotsSkipped * 2);
        dotsSkipped = 0;
      }
      await driver.printChunk(customChunkedBitmap);
    }
  }
  console.log(`Completed printing ${customChunkedBitmaps.length} chunks total`);
}

// Closely adapted from MarkScasn's application_driver
async function scanAndSave(
  driver: PaperHandlerDriverInterface,
  direction: ScanDirection
): Promise<string> {
  const pathOutFront = tmpNameSync({ postfix: '.jpeg' });
  await driver.setScanDirection(direction);
  await driver.scanAndSave(pathOutFront);

  // We can only print to one side from the thermal printer, but the interpret flow expects
  // a SheetOf 2 pages. Use an image of a blank sheet for the 2nd page.
  return pathOutFront;
}

function durationHasElapsed(start: Date, durationMs: number) {
  return new Date().getTime() - start.getTime() > durationMs;
}

export async function main(): Promise<void> {
  const driver = assertDefined(
    await getPaperHandlerDriver(),
    'Could not connect to paper handler'
  );
  await driver.initializePrinter();
  await driver.setLineSpacing(0);
  await driver.setPrintingSpeed('slow');

  let status = await driver.getPaperHandlerStatus();

  assert(!isCoverOpen(status), 'Paper handler cover is open');

  let logStart = new Date();
  while (!isPaperReadyToLoad(status)) {
    if (durationHasElapsed(logStart, POLL_LOG_INTERVAL)) {
      console.log('Waiting for paper in input');
      logStart = new Date();
    }

    await sleep(POLL_INTERVAL_MS);
    status = await driver.getPaperHandlerStatus();
  }

  await driver.loadPaper();
  await driver.parkPaper();

  status = await driver.getPaperHandlerStatus();
  assert(isPaperInScanner(status), 'Paper was not detected in scanner');

  const start = new Date();
  while (!durationHasElapsed(start, STRESS_TEST_DURATION_MS)) {
    assert(!isPaperJammed(status), 'Paper is jammed');
    console.log('Printing page');
    await driver.enablePrint();
    await chunkAndPrintPdf(driver, testPdf);
    await driver.disablePrint();

    console.log('Scanning page');
    const outputPath = await scanAndSave(driver, 'backward');
    console.log('Saved scan to', outputPath);

    console.log('Presenting paper');
    await driver.presentPaper();
    console.log('Parking paper');
    await driver.parkPaper();

    // May want to remove this sleep to really stress test
    await sleep(POLL_INTERVAL_MS);
  }
}
