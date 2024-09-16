import { assert, iter, sleep } from '@votingworks/basics';
import makeDebug from 'debug';
import { Buffer } from 'node:buffer';
import {
  ImageConversionOptions,
  PaperHandlerDriverInterface,
  VERTICAL_DOTS_IN_CHUNK,
  chunkBinaryBitmap,
  getPaperHandlerDriver,
  imageDataToBinaryBitmap,
  isPaperAnywhere,
  isMockPaperHandler,
  ScanDirection,
} from '@votingworks/custom-paper-handler';
import { pdfToImages } from '@votingworks/image-utils';
import { tmpNameSync } from 'tmp';
import { PRINT_DPI, PAPER_HANDLER_RESET_DELAY_MS, SCAN_DPI } from './constants';

const debug = makeDebug('mark-scan:custom-paper-handler:application-driver');

/**
 * This file is the layer between libs/custom-paper-handler/driver and mark-scan state machine.
 * It abstracts application-specific logic but doesn't send low-level USB commands directly to
 * the paper handler. Functions that are more complicated than a single driver command
 * invocation belong here.
 * A good rule of thumb is: if only the paper handler driver and external VX libs are being called,
 * the function belongs here. If the state machine state is being read or updated, it belongs in
 * ./state_machine.ts
 */

export async function setDefaults(
  driver: PaperHandlerDriverInterface
): Promise<void> {
  await driver.initializePrinter();
  debug('initialized printer (0x1B 0x40)');
  await driver.setLineSpacing(0);
  debug('set line spacing to 0');
  await driver.setPrintingSpeed('slow');
  debug('set printing speed to slow');
}

export async function printBallotChunks(
  driver: PaperHandlerDriverInterface,
  pdfData: Buffer,
  options: Partial<ImageConversionOptions> = {}
): Promise<void> {
  debug('+printBallotChunks');
  const enablePrintPromise = driver.enablePrint();
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

  // TODO: Might be cleaner to move the image chunking below into the
  // libs/custom-paper-handler layer, so we can hae a common
  // `printPage(ImageData)` for both the real and mock paper handlers. Branching
  // here in the interest of time.
  if (isMockPaperHandler(driver)) {
    driver.setMockPaperContents(page);
    return;
  }

  const ballotBinaryBitmap = imageDataToBinaryBitmap(page, options);
  const customChunkedBitmaps = chunkBinaryBitmap(ballotBinaryBitmap);

  await enablePrintPromise;
  let dotsSkipped = 0;
  for (const customChunkedBitmap of customChunkedBitmaps) {
    if (customChunkedBitmap.empty) {
      dotsSkipped += VERTICAL_DOTS_IN_CHUNK;
    } else {
      if (dotsSkipped) {
        await driver.setRelativeVerticalPrintPosition(dotsSkipped * 2); // assuming default vertical units, 1 / 408 units
        dotsSkipped = 0;
      }
      await driver.printChunk(customChunkedBitmap);
    }
  }
  debug(
    '-printBallotChunks. Completed printing %d chunks total',
    customChunkedBitmaps.length
  );
}

export async function scanAndSave(
  driver: PaperHandlerDriverInterface,
  direction: ScanDirection
): Promise<string> {
  const pathOutFront = tmpNameSync({ postfix: '.jpeg' });
  const status = await driver.getPaperHandlerStatus();
  // Scan can happen from loaded or parked state. If the paper is not loaded or parked
  // it means the voter may have taken the paper out of the infeed
  if (!isPaperAnywhere(status)) {
    throw new Error('Paper has been removed');
  }

  debug(`scanning sheet [direction: ${direction}]`);
  await driver.setScanDirection(direction);
  await driver.scanAndSave(pathOutFront);

  // We can only print to one side from the thermal printer, but the interpret flow expects
  // a SheetOf 2 pages. Use an image of a blank sheet for the 2nd page.
  return pathOutFront;
}

export async function loadAndParkPaper(
  driver: PaperHandlerDriverInterface
): Promise<void> {
  await driver.loadPaper();
  await driver.parkPaper();
}

export async function resetAndReconnect(
  oldDriver: PaperHandlerDriverInterface,
  /* istanbul ignore next - override is provided so tests don't need to wait the full delay duration. Tests will never exercise the default value */
  resetDelay: number = PAPER_HANDLER_RESET_DELAY_MS
): Promise<PaperHandlerDriverInterface> {
  if (isMockPaperHandler(oldDriver)) {
    return oldDriver;
  }

  await oldDriver.resetScan();
  // resetScan() command resolves with success as soon as the command is received, not when the command completes.
  // It actually takes ~7 seconds to complete, so we force the state machine to stay in this state until it's done.
  // TODO can we transition in the state machine using printer state instead of waiting a fixed time?
  await sleep(resetDelay);
  await oldDriver.disconnect();
  debug('Getting new driver');
  const newDriver = await getPaperHandlerDriver();
  assert(newDriver, 'Could not create new paper handler driver');
  await setDefaults(newDriver);
  return newDriver;
}
