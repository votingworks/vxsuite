import { iter } from '@votingworks/basics';
import { pdfToImages } from '@votingworks/image-utils';
import * as fs from 'node:fs';
import { expect } from 'vitest';

export async function expectToMatchSavedPdf(
  actualPdf: Uint8Array,
  expectedPdfPath: string
): Promise<void> {
  const expectedPdf = Uint8Array.from(fs.readFileSync(expectedPdfPath));
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
