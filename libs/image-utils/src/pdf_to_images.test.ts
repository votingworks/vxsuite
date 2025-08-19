import { Buffer } from 'node:buffer';
import { iter } from '@votingworks/basics';
import { Size } from '@votingworks/types';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  PdfPage,
  getPdfPageCount,
  parsePdf,
  pdfToImages,
} from './pdf_to_images';

async function readMsBallotPdf(): Promise<Uint8Array> {
  return Uint8Array.from(
    await readFile(join(__dirname, '../test/fixtures/ms-ballot.pdf'))
  );
}

function assertHasPageCountAndSize(
  pages: PdfPage[],
  { pageCount, size }: { pageCount: number; size: Size }
): void {
  expect(pages).toHaveLength(pageCount);
  for (const {
    page: { width, height },
  } of pages) {
    expect({ width, height }).toMatchObject(size);
  }
}

test('yields the right number of images sized correctly', async () => {
  assertHasPageCountAndSize(
    await iter(pdfToImages(await readMsBallotPdf())).toArray(),
    {
      pageCount: 6,
      size: {
        width: 612,
        height: 792,
      },
    }
  );
});

test('works with Buffer', async () => {
  assertHasPageCountAndSize(
    await iter(pdfToImages(Buffer.from(await readMsBallotPdf()))).toArray(),
    {
      pageCount: 6,
      size: {
        width: 612,
        height: 792,
      },
    }
  );
});

test('can generate images with a different scale', async () => {
  assertHasPageCountAndSize(
    await iter(pdfToImages(await readMsBallotPdf(), { scale: 2 })).toArray(),
    {
      pageCount: 6,
      size: { width: 1224, height: 1584 },
    }
  );
});

test('parsePdf', async () => {
  const pdf = await parsePdf(await readMsBallotPdf());
  expect(pdf.numPages).toEqual(6);
});

test('getPdfPageCount', async () => {
  const pageCount = await getPdfPageCount(await readMsBallotPdf());
  expect(pageCount).toEqual(6);
});
