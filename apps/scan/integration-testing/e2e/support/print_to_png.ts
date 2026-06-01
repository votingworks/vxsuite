import { readFileSync } from 'node:fs';
import { getMockFileFujitsuPrinterHandler } from '@votingworks/fujitsu-thermal-printer';
import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import type { ScreenshotCounter } from '@votingworks/test-utils';

/** Reads the most recently printed PDF and saves each page as a PNG in test-results/screenshots. */
export async function capturePrintedReport(
  name: string,
  counter: ScreenshotCounter
): Promise<void> {
  const printPath = getMockFileFujitsuPrinterHandler().getLastPrintPath();
  if (!printPath) return;
  const pdfBytes = new Uint8Array(readFileSync(printPath));
  let pageIndex = 0;
  for await (const { page } of pdfToImages(pdfBytes, { scale: 2 })) {
    const suffix = pageIndex === 0 ? name : `${name}-page${pageIndex + 1}`;
    await writeImageData(
      `./test-results/screenshots/${counter.next()}-${suffix}.png`,
      page
    );
    pageIndex += 1;
  }
}
