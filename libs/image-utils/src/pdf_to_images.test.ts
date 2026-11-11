import { Buffer } from 'node:buffer';
import { assertDefined, iter } from '@votingworks/basics';
import type { Size } from '@votingworks/types';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { expect, test } from 'vitest';
import type { ImageData } from 'canvas';
import { isRgba } from './image_data.js';
import {
  type PdfPage,
  getPdfPageCount,
  getPdfPageSizes,
  pdfToImages,
} from './pdf_to_images.js';

async function readMsBallotPdf(): Promise<Uint8Array> {
  return Uint8Array.from(
    await readFile(join(import.meta.dirname, '../test/fixtures/ms-ballot.pdf'))
  );
}

function assertHasPageCountAndSize(
  pages: ReadonlyArray<PdfPage<ImageData>>,
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

test('renders visible content, not blank pages', async () => {
  const firstPage = assertDefined(
    await iter(pdfToImages(await readMsBallotPdf())).first()
  );
  const { data } = firstPage.page;
  let darkPixelCount = 0;
  for (let offset = 0; offset < data.length; offset += 4) {
    if ((data[offset] ?? 255) < 128) {
      darkPixelCount += 1;
    }
  }
  expect(darkPixelCount).toBeGreaterThan(1000);
});

test('maxPages limits the pages rendered', async () => {
  const pages = await iter(
    pdfToImages(await readMsBallotPdf(), { maxPages: 2 })
  ).toArray();
  expect(
    pages.map(({ pageNumber, pageCount }) => [pageNumber, pageCount])
  ).toEqual([
    [1, 6],
    [2, 6],
  ]);
});

test('getPdfPageSizes', async () => {
  expect(await getPdfPageSizes(await readMsBallotPdf())).toEqual(
    Array.from({ length: 6 }, () => ({ width: 612, height: 792 }))
  );
});

test('rejects invalid PDF data', async () => {
  await expect(getPdfPageCount(new Uint8Array())).rejects.toThrow(
    'Unable to load PDF'
  );
  await expect(
    iter(pdfToImages(new TextEncoder().encode('not a pdf'))).toArray()
  ).rejects.toThrow('Unable to load PDF');
});

test('can render on a transparent background', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]).drawRectangle({ x: 0, y: 0, width: 50, height: 100 });
  const pdf = await doc.save();

  const [opaque, transparent] = await Promise.all(
    (['white', 'transparent'] as const).map(async (background) =>
      assertDefined(await iter(pdfToImages(pdf, { background })).first())
    )
  );
  const leftAlpha = 3;
  const rightAlpha = 99 * 4 + 3;
  expect(opaque?.page.data[leftAlpha]).toEqual(255);
  expect(opaque?.page.data[rightAlpha]).toEqual(255);
  expect(transparent?.page.data[leftAlpha]).toEqual(255);
  expect(transparent?.page.data[rightAlpha]).toEqual(0);
});

test('getPdfPageCount', async () => {
  const pageCount = await getPdfPageCount(await readMsBallotPdf());
  expect(pageCount).toEqual(6);
});

test('getPdfPageCount leaves the input intact and accepts a Buffer', async () => {
  const pdfBytes = Buffer.from(await readMsBallotPdf());
  const originalLength = pdfBytes.length;
  expect(await getPdfPageCount(pdfBytes)).toEqual(6);
  expect(pdfBytes.length).toEqual(originalLength);
});

test('can generate grayscale images', async () => {
  const pages = await iter(
    pdfToImages(await readMsBallotPdf(), { color: 'gray' })
  ).toArray();

  assertHasPageCountAndSize(pages, {
    pageCount: 6,
    size: { width: 612, height: 792 },
  });

  for (const { page } of pages) {
    expect(isRgba(page)).toEqual(false);
    expect(page.data).toHaveLength(page.width * page.height);
  }
});
