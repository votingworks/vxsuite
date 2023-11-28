import { assert, iter, sleep } from '@votingworks/basics';
import makeDebug from 'debug';
import { Buffer } from 'buffer';
import { SheetOf } from '@votingworks/types';
import {
  ImageConversionOptions,
  PaperHandlerDriver,
  PaperHandlerStatus,
  VERTICAL_DOTS_IN_CHUNK,
  chunkBinaryBitmap,
  getPaperHandlerDriver,
  imageDataToBinaryBitmap,
} from '@votingworks/custom-paper-handler';
import { join } from 'path';
import { pdfToImages } from '@votingworks/image-utils';
import { tmpNameSync } from 'tmp';
import {
  BooleanEnvironmentVariableName,
  isFeatureFlagEnabled,
} from '@votingworks/utils';
import { PRINT_DPI, RESET_DELAY_MS, SCAN_DPI } from './constants';

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

export function isPaperJammed(paperHandlerStatus: PaperHandlerStatus): boolean {
  return paperHandlerStatus.paperJam;
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
    paperHandlerStatus.scanInProgress
  );
}

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

export function isPaperInOutput(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  // From experimentation both of these are true when paper is in rear output
  return (
    paperHandlerStatus.ticketPresentInOutput ||
    paperHandlerStatus.paperOutSensor
  );
}

export function isPaperAnywhere(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  return (
    isPaperInInput(paperHandlerStatus) ||
    isPaperInOutput(paperHandlerStatus) ||
    isPaperInScanner(paperHandlerStatus)
  );
}

// Returns true if the ballot box is detached. Currently unused but kept for future
// ballot box attached/detached state handling.
export function isBallotBoxDetached(
  paperHandlerStatus: PaperHandlerStatus
): boolean {
  if (
    isFeatureFlagEnabled(
      BooleanEnvironmentVariableName.DISABLE_BALLOT_BOX_CHECK
    )
  ) {
    return false;
  }

  // ballotBoxAttachSensor is true when the ballot box is detached. This is confusing.
  // A better name for this status would be "ballotBoxNeedsToBeAttachedSensor" but we keep
  // it as-is to stay consistent with the manual.
  return paperHandlerStatus.ballotBoxAttachSensor;
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

function getBlankSheetFixturePath(): string {
  return join(__dirname, 'fixtures', 'blank-sheet.jpg');
}

export async function scanAndSave(
  driver: PaperHandlerDriver
): Promise<SheetOf<string>> {
  debug('+scanAndSave');
  const pathOutFront = tmpNameSync({ postfix: '.jpeg' });
  // We can only print to one side from the thermal printer, but the interpret flow expects
  // a SheetOf 2 pages. Use an image of a blank sheet for the 2nd page.
  const status = await driver.getPaperHandlerStatus();
  // Scan can happen from loaded or parked state. If the paper is not loaded or parked
  // it means the voter may have taken the paper out of the infeed
  if (!isPaperAnywhere(status)) {
    throw new Error('Paper has been removed');
  }

  await driver.scanAndSave(pathOutFront);
  debug('Scan successful');
  return [pathOutFront, getBlankSheetFixturePath()];
}

export function getSampleBallotFilepaths(): SheetOf<string> {
  return [
    join(
      __dirname,
      'fixtures',
      'bmd-ballot-general-north-springfield-style-5.jpg'
    ),
    getBlankSheetFixturePath(),
  ];
}

export async function loadAndParkPaper(
  driver: PaperHandlerDriver
): Promise<void> {
  debug('Loading paper');
  await driver.loadPaper();
  debug('Parking paper');
  await driver.parkPaper();
  debug('Done loading and parking');
}

export async function resetAndReconnect(
  oldDriver: PaperHandlerDriver
): Promise<PaperHandlerDriver> {
  await oldDriver.resetScan();
  // resetScan() command resolves with success as soon as the command is received, not when the command completes.
  // It actually takes ~7 seconds to complete, so we force the state machine to stay in this state until it's done.
  // TODO can we transition in the state machine using printer state instead of waiting a fixed time?
  await sleep(RESET_DELAY_MS);
  await oldDriver.disconnect();
  debug('Getting new driver');
  const newDriver = await getPaperHandlerDriver();
  assert(newDriver, 'Could not create new paper handler driver');
  await setDefaults(newDriver);
  return newDriver;
}
