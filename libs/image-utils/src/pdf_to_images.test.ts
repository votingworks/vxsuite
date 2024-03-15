import { iter } from '@votingworks/basics';
import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { Size } from '@votingworks/types';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PdfPage, pdfAtPathToImagePaths, pdfToImages } from './pdf_to_images';
import { loadImageData } from '.';

const pdfNotRequiringPdfjsIntermediateCanvasBufferPath = join(
  __dirname,
  '../test/fixtures/pdf-not-requiring-pdfjs-intermediate-canvas.pdf'
);
const pdfNotRequiringPdfjsIntermediateCanvasBuffer = readFileSync(
  pdfNotRequiringPdfjsIntermediateCanvasBufferPath
);
const pdfRequiringPdfjsIntermediateCanvasBuffer =
  electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asBuffer();

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
    await iter(
      pdfToImages(pdfNotRequiringPdfjsIntermediateCanvasBuffer)
    ).toArray(),
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
    await iter(
      pdfToImages(pdfNotRequiringPdfjsIntermediateCanvasBuffer, { scale: 2 })
    ).toArray(),
    {
      pageCount: 6,
      size: { width: 1224, height: 1584 },
    }
  );
});

test('can render a PDF that requires the PDF.js intermediate canvas', async () => {
  assertHasPageCountAndSize(
    await iter(
      pdfToImages(pdfRequiringPdfjsIntermediateCanvasBuffer)
    ).toArray(),
    {
      pageCount: 2,
      size: { width: 684, height: 1080 },
    }
  );
});

test('pdfAtPathToImagePaths', async () => {
  const paths = await pdfAtPathToImagePaths(
    pdfNotRequiringPdfjsIntermediateCanvasBufferPath
  );
  for (const path of paths) {
    expect(await loadImageData(path)).toBeDefined();
  }
});
