import { expect, test } from 'vitest';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { concatenatePdfs } from './concatenate_pdfs.js';
import { getPdfPageCount } from './pdf_to_images.js';

const MS_BALLOT_PDF_PATH = join(
  import.meta.dirname,
  '../test/fixtures/ms-ballot.pdf'
);

test('combines the pages of every PDF in order', async () => {
  const pdf = await readFile(MS_BALLOT_PDF_PATH);
  const combined = await concatenatePdfs([pdf, pdf]);
  expect(await getPdfPageCount(new Uint8Array(combined))).toEqual(12);
});

test('produces byte-identical output across calls', async () => {
  const pdf = await readFile(MS_BALLOT_PDF_PATH);
  const first = await concatenatePdfs([pdf]);
  const second = await concatenatePdfs([pdf]);
  expect(Buffer.from(first).equals(Buffer.from(second))).toEqual(true);
});
