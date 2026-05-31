import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertDefined } from '@votingworks/basics';
import { getMockFilePrinterHandler } from '@votingworks/printing';
import {
  capturePdfScreenshots,
  ScreenshotCounter,
} from '@votingworks/test-utils';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';

/**
 * Captures the readiness report PDF that was saved to the mock USB drive.
 */
export async function captureReadinessReport(
  name: string,
  counter: ScreenshotCounter
): Promise<void> {
  const dataPath = assertDefined(getMockFileUsbDriveHandler().getDataPath());
  const reportFilename = assertDefined(
    readdirSync(dataPath).find(
      (filename) =>
        filename.startsWith('readiness-report__') && filename.endsWith('.pdf')
    ),
    'expected a readiness report PDF on the mock USB drive'
  );
  const pdfBytes = new Uint8Array(readFileSync(join(dataPath, reportFilename)));
  await capturePdfScreenshots(pdfBytes, name, counter);
}

/**
 * Captures the most recently printed ballot PDF from the mock printer. The
 * print is single-sided, so blank back pages are skipped.
 */
export async function capturePrintedBallot(
  name: string,
  counter: ScreenshotCounter
): Promise<void> {
  const printPath = assertDefined(
    getMockFilePrinterHandler().getLastPrintPath(),
    'expected a printed ballot PDF from the mock printer'
  );
  const pdfBytes = new Uint8Array(readFileSync(printPath));
  await capturePdfScreenshots(pdfBytes, name, counter, {
    skipBlankPages: true,
  });
}
