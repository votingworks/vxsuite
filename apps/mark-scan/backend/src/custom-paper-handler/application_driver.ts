import { assert } from '@votingworks/basics';
import makeDebug from 'debug';
import { Buffer } from 'buffer';
import {
  ElectionDefinition,
  PageInterpretationWithFiles,
  PrecinctSelection,
  SheetInterpretation,
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
  SheetInterpretationWithPages,
  interpretSheetAndSaveImages,
} from '@votingworks/ballot-interpreter';
import { BALLOT_IMAGES_PATH } from './constants';

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
  pdfData: Uint8Array,
  options: Partial<ImageConversionOptions> = {}
): Promise<void> {
  const enablePrintPromise = driver.enablePrint();

  let time = Date.now();
  const pages: ImageData[] = [];
  for await (const { page, pageCount } of pdfToImages(Buffer.from(pdfData), {
    scale: 200 / 72,
  })) {
    assert(pageCount === 1, `Unexpected page count ${pageCount}`);
    pages.push(page);
  }
  const page = pages[0];
  assert(page, 'Unexpected undefined page');
  debug(`pdf to image took ${Date.now() - time} ms`);
  time = Date.now();

  const ballotBinaryBitmap = imageDataToBinaryBitmap(page, options);
  debug(`bitmap width: ${ballotBinaryBitmap.width}`);
  debug(`bitmap height: ${ballotBinaryBitmap.height}`);
  debug(`image to binary took ${Date.now() - time} ms`);
  time = Date.now();

  const customChunkedBitmaps = chunkBinaryBitmap(ballotBinaryBitmap);
  debug(`num chunk rows: ${customChunkedBitmaps.length}`);
  debug(`binary to chunks took ${Date.now() - time} ms`);

  await enablePrintPromise;
  debug('Begin printing');
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
  debug('Completed printing %d chunks total', customChunkedBitmaps.length);
}

export async function scanAndSave(
  driver: PaperHandlerDriver
): Promise<SheetOf<string>> {
  debug('+scanAndSave');
  const dir = '/tmp';
  const dateString = new Date().toISOString();
  const pathOutFront = join(dir, `ballot-statemachine-${dateString}-A.jpg`);
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

function combinePageInterpretationsForSheet(
  pages: SheetOf<PageInterpretationWithFiles>
): SheetInterpretation {
  const [front, back] = pages;
  const frontType = front.interpretation.type;
  const backType = back.interpretation.type;

  // mark-scan only support interpretation of single-sided BMD ballots
  if (
    (frontType === 'InterpretedBmdPage' && backType === 'BlankPage') ||
    (backType === 'InterpretedBmdPage' && frontType === 'BlankPage')
  ) {
    return { type: 'ValidSheet' };
  }

  debug(
    'Unexpected page interpretation: %s front type and %s back type',
    frontType,
    backType
  );

  return {
    type: 'InvalidSheet',
    reason: 'unknown',
  };
}

export async function interpretScannedBallots(
  electionDefinition: ElectionDefinition,
  precinctSelection: PrecinctSelection,
  testMode: boolean,
  sheetOfImagePaths: SheetOf<string>,
  sheetId: string
): Promise<SheetInterpretationWithPages> {
  const pageInterpretations = await interpretSheetAndSaveImages(
    {
      electionDefinition,
      precinctSelection,
      testMode,
    },
    sheetOfImagePaths,
    sheetId,
    BALLOT_IMAGES_PATH
  );

  const combinedInterpretation: SheetInterpretationWithPages = {
    ...combinePageInterpretationsForSheet(pageInterpretations),
    pages: pageInterpretations,
  };

  // Use JSON.stringify instead of string interpolation because the latter
  // only prints one level deep
  debug(`interpretation: ${JSON.stringify(combinedInterpretation, null, 2)}`);
  return combinedInterpretation;
}
