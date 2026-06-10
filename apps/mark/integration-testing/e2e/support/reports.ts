import { readFileSync } from 'node:fs';
import { assertDefined } from '@votingworks/basics';
import {
  capturePdfScreenshots,
  type ScreenshotNamer,
} from '@votingworks/integration-test-utils';
import { getMockFilePrinterHandler } from '@votingworks/printing';

/**
 * Captures the most recently printed ballot PDF from the mock printer. The
 * print is single-sided, so blank back pages are skipped.
 */
export async function capturePrintedBallot(
  name: string,
  namer: ScreenshotNamer
): Promise<void> {
  const printPath = assertDefined(
    getMockFilePrinterHandler().getLastPrintPath(),
    'expected a printed ballot PDF from the mock printer'
  );
  const pdfBytes = new Uint8Array(readFileSync(printPath));
  await capturePdfScreenshots(pdfBytes, name, namer, {
    skipBlankPages: true,
  });
}
