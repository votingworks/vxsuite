import {
  capturePrintedPdf,
  type ScreenshotNamer,
} from '@votingworks/integration-test-utils';
import { getMockFilePrinterHandler } from '@votingworks/printing';

/**
 * Captures the most recently printed ballot PDF from the mock printer. The
 * print is single-sided, so blank back pages are skipped.
 */
export function capturePrintedBallot(
  name: string,
  namer: ScreenshotNamer
): Promise<void> {
  return capturePrintedPdf(
    getMockFilePrinterHandler().getLastPrintPath(),
    name,
    namer,
    { skipBlankPages: true }
  );
}
