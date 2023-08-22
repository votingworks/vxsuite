import { assert, iter } from '@votingworks/basics';
import makeDebug from 'debug';
import { Buffer } from 'buffer';
import {
  AdjudicationReason,
  ElectionDefinition,
  MarkThresholds,
  PrecinctSelection,
  SheetOf,
} from '@votingworks/types';
import {
  ImageConversionOptions,
  PaperHandlerDriver,
  PaperHandlerStatus,
  VERTICAL_DOTS_IN_CHUNK,
  chunkBinaryBitmap,
  imageDataToBinaryBitmap,
} from '@votingworks/custom-paper-handler';
import { join } from 'path';
import { pdfToImages } from '@votingworks/image-utils';
import {
  InterpretFileResult,
  interpretSheet,
} from '@votingworks/ballot-interpreter';
import { tmpNameSync } from 'tmp';
import { PRINT_DPI, SCAN_DPI } from './constants';

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

export function isPaperInInput(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  return (
    paperHandlerStatus.paperInputLeftInnerSensor ||
    paperHandlerStatus.paperInputLeftOuterSensor ||
    paperHandlerStatus.paperInputRightInnerSensor ||
    paperHandlerStatus.paperInputRightOuterSensor
  );
}

export function isPaperReadyToLoad(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  return (
    paperHandlerStatus.paperInputLeftInnerSensor &&
    paperHandlerStatus.paperInputLeftOuterSensor &&
    paperHandlerStatus.paperInputRightInnerSensor &&
    paperHandlerStatus.paperInputRightOuterSensor
  );
}

export function isPaperInScanner(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  return (
    paperHandlerStatus.paperPreCisSensor ||
    paperHandlerStatus.paperPostCisSensor ||
    paperHandlerStatus.preHeadSensor ||
    paperHandlerStatus.paperOutSensor ||
    paperHandlerStatus.parkSensor ||
    paperHandlerStatus.paperJam ||
    paperHandlerStatus.scanInProgress
  );
}

export function isPaperInOutput(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  return paperHandlerStatus.ticketPresentInOutput;
}

export function isPaperAnywhere(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  return (
    isPaperInInput(paperHandlerStatus) || isPaperInScanner(paperHandlerStatus)
  );
}

export async function logRawStatus(driver: PaperHandlerDriver): Promise<void> {
  debug('%O', await driver.getPaperHandlerStatus());
}

export async function setDefaults(driver: PaperHandlerDriver): Promise<void> {
  await driver.initializePrinter();
  debug('initialized printer (0x1B 0x40)');
  await driver.setLineSpacing(0);
  debug('set line spacing to 0');
  await driver.setPrintingSpeed('slow');
  debug('set printing speed to slow');
}

export async function printBallot(
  driver: PaperHandlerDriver,
  pdfData: Buffer,
  options: Partial<ImageConversionOptions> = {}
): Promise<void> {
  debug('+printBallot');
  const enablePrintPromise = driver.enablePrint();
  const pageInfo = await iter(
    pdfToImages(pdfData, { scale: PRINT_DPI / SCAN_DPI })
  ).first();
  assert(
    pageInfo?.pageCount === 1,
    `Unexpected page count ${pageInfo?.pageCount ?? 0}`
  );
  const { page } = pageInfo;

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
    '-printBallot. Completed printing %d chunks total',
    customChunkedBitmaps.length
  );
}

export async function scanAndSave(
  driver: PaperHandlerDriver
): Promise<SheetOf<string>> {
  debug('+scanAndSave');
  const pathOutFront = tmpNameSync({ postfix: '.jpeg' });
  // We can only print to one side from the thermal printer, but the interpret flow expects
  // a SheetOf 2 pages. Use an image of a blank sheet for the 2nd page.
  const blankSheetFixturePath = join(__dirname, 'fixtures', 'blank-sheet.jpg');
  const status = await driver.getPaperHandlerStatus();
  // Scan can happen from loaded or parked state. If the paper is not loaded or parked
  // it means the voter may have taken the paper out of the infeed
  if (!isPaperAnywhere(status)) {
    throw new Error('Paper has been removed');
  }

  await driver.scanAndSave(pathOutFront);
  debug('Scan successful');
  return [pathOutFront, blankSheetFixturePath];
}

export async function interpretScannedBallots(
  electionDefinition: ElectionDefinition,
  precinctSelection: PrecinctSelection,
  testMode: boolean,
  markThresholds: MarkThresholds,
  adjudicationReasons: readonly AdjudicationReason[],
  sheetOfImagePaths: SheetOf<string>
): Promise<SheetOf<InterpretFileResult>> {
  const interpretation = await interpretSheet(
    {
      electionDefinition,
      precinctSelection,
      testMode,
      markThresholds,
      adjudicationReasons,
    },
    sheetOfImagePaths
  );

  // Use JSON.stringify instead of string interpolation because the latter
  // only prints one level deep
  debug(`interpretation: ${JSON.stringify(interpretation, null, 2)}`);
  return interpretation;
}
