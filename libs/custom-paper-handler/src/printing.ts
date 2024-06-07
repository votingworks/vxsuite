import { Buffer } from 'buffer';
import makeDebug from 'debug';
import { pdfToCustomPaperHandlerBitmapSeries } from '@votingworks/image-utils-rs';
import { PaperHandlerBitmap } from '@votingworks/types';
import { Uint8Max } from './bits';
import { DEVICE_MAX_WIDTH_DOTS } from './driver/constants';
import { PaperHandlerDriver } from './driver';

const debug = makeDebug('mark-scan:custom-paper-handler:printing');

/**
 * Below this value, we consider the grayscale to be black. Otherwise, white.
 */
const DEFAULT_GRAYSCALE_WHITE_THRESHOLD = 230;

// Both supported values for PrintModeDotDensity have 24 dots in the vertical direction.
// See command manual page 84: 0x1B 0x2A "Select image print mode"
// This const should be extended if adding support for 8 dot density.
const VERTICAL_DOTS_IN_CHUNK = 24;

export function getBlackChunk(width: number): PaperHandlerBitmap {
  return {
    width,
    data: new Uint8Array(width * 3).fill(Uint8Max),
  };
}

export function getWhiteChunk(width: number): PaperHandlerBitmap {
  return {
    width,
    data: new Uint8Array(width * 3).fill(0),
  };
}

export async function printPdf(
  driver: PaperHandlerDriver,
  pdfData: Buffer
): Promise<void> {
  debug('+printPdf');
  const enablePrintPromise = driver.enablePrint();
  const bitmaps = pdfToCustomPaperHandlerBitmapSeries(pdfData, {
    whiteThreshold: DEFAULT_GRAYSCALE_WHITE_THRESHOLD,
    width: DEVICE_MAX_WIDTH_DOTS,
  });
  await enablePrintPromise;

  let dotsSkipped = 0;
  for (const bitmap of bitmaps) {
    if (bitmap === null) {
      dotsSkipped += VERTICAL_DOTS_IN_CHUNK;
    } else {
      if (dotsSkipped) {
        await driver.setRelativeVerticalPrintPosition(dotsSkipped * 2); // assuming default vertical units, 1 / 408 units
        dotsSkipped = 0;
      }
      await driver.printChunk(bitmap);
    }
  }
  debug('-printPdf. Completed printing %d chunks total', bitmaps.length);
}
