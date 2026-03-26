import { iter } from '@votingworks/basics';
import { pdfToImages } from '@votingworks/image-utils';
import { Buffer } from 'node:buffer';
import * as fs from 'node:fs';
import { expect } from 'vitest';

/**
 * Compares a generated PDF against a saved fixture. Tries byte equality first
 * (fast path), then falls back to visual page-by-page comparison if bytes
 * differ.
 */
export async function expectToMatchSavedPdf(
  actualPdf: Uint8Array,
  expectedPdfPath: string
): Promise<void> {
  const expectedPdf = Uint8Array.from(fs.readFileSync(expectedPdfPath));
  if (Buffer.from(actualPdf).equals(Buffer.from(expectedPdf))) {
    return;
  }

  // Bytes differ — compare visually
  const actualPdfPages = pdfToImages(actualPdf);
  const expectedPdfPages = pdfToImages(expectedPdf);
  const pdfPagePairs = iter(actualPdfPages).zip(expectedPdfPages);
  for await (const [
    { page: actualPage, pageNumber },
    { page: expectedPage },
  ] of pdfPagePairs) {
    await expect(actualPage).toMatchImage(expectedPage, {
      diffPath: `${expectedPdfPath}-p${pageNumber}-diff.png`,
      failureThreshold: 0.00002,
    });
  }
}
