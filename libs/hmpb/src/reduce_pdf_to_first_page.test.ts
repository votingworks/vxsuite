import { expect, test } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { reducePdfToFirstPage } from './reduce_pdf_to_first_page';

/** Builds a PDF whose pages have the given [width, height] dimensions. */
async function buildPdf(
  ...pageSizes: Array<[number, number]>
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const size of pageSizes) {
    doc.addPage(size);
  }
  return doc.save();
}

test('keeps only the first page', async () => {
  const pdf = await buildPdf([200, 300], [400, 500], [600, 700]);

  const reduced = await reducePdfToFirstPage(pdf);

  const result = await PDFDocument.load(reduced);
  expect(result.getPageCount()).toEqual(1);
  // The retained page is the first one, identified by its distinctive size.
  const [page] = result.getPages();
  expect(page.getWidth()).toEqual(200);
  expect(page.getHeight()).toEqual(300);
});

test('leaves a single-page PDF unchanged in page count', async () => {
  const pdf = await buildPdf([200, 300]);

  const reduced = await reducePdfToFirstPage(pdf);

  const result = await PDFDocument.load(reduced);
  expect(result.getPageCount()).toEqual(1);
});
