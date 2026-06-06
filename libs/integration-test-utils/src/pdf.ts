import { pdfToImages, writeImageData } from '@votingworks/image-utils';
import { SCREENSHOTS_DIR } from './constants';
import type { ScreenshotCounter } from './screenshots';

export interface CapturePdfScreenshotsOptions {
  /**
   * Skip fully-blank pages. Useful for single-sided print jobs, where the mock
   * printer inserts an empty back page after each content page.
   */
  skipBlankPages?: boolean;
}

function isBlankImage(image: { data: Uint8ClampedArray }): boolean {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (
      (r !== undefined && r < 250) ||
      (g !== undefined && g < 250) ||
      (b !== undefined && b < 250)
    ) {
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
export async function capturePdfScreenshots(
  pdfBytes: Uint8Array,
  name: string,
  counter: ScreenshotCounter,
  options: CapturePdfScreenshotsOptions = {}
): Promise<void> {
  let captured = 0;
  for await (const { page } of pdfToImages(pdfBytes, { scale: 2 })) {
    if (options.skipBlankPages && isBlankImage(page)) continue;
    const suffix = captured === 0 ? name : `${name}-page${captured + 1}`;
    await writeImageData(
      `${SCREENSHOTS_DIR}/${counter.next()}-${suffix}.png`,
      page
    );
    captured += 1;
  }
}
