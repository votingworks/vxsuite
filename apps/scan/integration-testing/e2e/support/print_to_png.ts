import { getMockFileFujitsuPrinterHandler } from '@votingworks/fujitsu-thermal-printer';
import {
  capturePrintedPdf,
  type ScreenshotNamer,
} from '@votingworks/integration-test-utils';

/** Reads the most recently printed PDF and saves each page as a PNG in test-results/screenshots. */
export function capturePrintedReport(
  name: string,
  namer: ScreenshotNamer
): Promise<void> {
  return capturePrintedPdf(
    getMockFileFujitsuPrinterHandler().getLastPrintPath(),
    name,
    namer
  );
}
