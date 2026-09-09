import { Buffer } from 'node:buffer';
import { assertDefined, iter } from '@votingworks/basics';
import { Size } from '@votingworks/types';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { ImageData } from 'canvas';
import { isRgba } from './image_data';
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

test('parsePdf', async () => {
  const pdf = await parsePdf(await readMsBallotPdf());
  expect(pdf.numPages).toEqual(6);
});

test('getPdfPageCount', async () => {
  const pageCount = await getPdfPageCount(await readMsBallotPdf());
  expect(pageCount).toEqual(6);
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
