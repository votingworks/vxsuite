import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assertDefined } from '@votingworks/basics';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { getMockFilePrinterHandler } from '@votingworks/printing';
import type { ScreenshotCounter } from '@votingworks/test-utils';
import { getMockFileUsbDriveHandler } from '@votingworks/usb-drive';

interface CapturePdfOptions {
  /**
   * Skip fully-blank pages. Useful for single-sided print jobs, where the mock
   * printer inserts an empty back page after each content page.
   */
  skipBlankPages?: boolean;
}

function isBlankImage(image: { data: Uint8ClampedArray }): boolean {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) {
      return false;
    }
  }
  return true;
}

/**
 * Renders each page of a PDF to a numbered PNG in the screenshots directory, so
 * generated PDFs (reports, printed ballots) appear alongside the UI
 * screenshots.
 */
async function capturePdf(
  pdfBytes: Uint8Array,
  name: string,
  counter: ScreenshotCounter,
  options: CapturePdfOptions = {}
): Promise<void> {
  let captured = 0;
  for await (const { page } of pdfToImages(pdfBytes, { scale: 2 })) {
    if (options.skipBlankPages && isBlankImage(page)) continue;
    const suffix = captured === 0 ? name : `${name}-page${captured + 1}`;
    await writeImageData(
      `./test-results/screenshots/${counter.next()}-${suffix}.png`,
      page
    );
    captured += 1;
  }
}

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
  await capturePdf(pdfBytes, name, counter);
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
  await capturePdf(pdfBytes, name, counter, { skipBlankPages: true });
}
