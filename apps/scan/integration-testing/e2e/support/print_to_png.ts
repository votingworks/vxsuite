import { readFileSync } from 'node:fs';
import { getMockFileFujitsuPrinterHandler } from '@votingworks/fujitsu-thermal-printer';
import {
  capturePdfScreenshots,
  type ScreenshotCounter,
} from '@votingworks/test-utils';

/** Reads the most recently printed PDF and saves each page as a PNG in test-results/screenshots. */
export async function capturePrintedReport(
  name: string,
  counter: ScreenshotCounter
): Promise<void> {
  const printPath = getMockFileFujitsuPrinterHandler().getLastPrintPath();
  if (!printPath) return;
  const pdfBytes = new Uint8Array(readFileSync(printPath));
  await capturePdfScreenshots(pdfBytes, name, counter);
}
