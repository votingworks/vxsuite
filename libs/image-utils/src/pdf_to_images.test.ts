import { iter } from '@votingworks/basics';
import { Size } from '@votingworks/types';
import { promises as fs } from 'fs';
import { join } from 'path';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { PdfPage, pdfToImages, setPdfRenderWorkerSrc } from './pdf_to_images';

const ballotNotRequiringPdfjsIntermediateCanvasPath = join(
  __dirname,
  '../../../apps/central-scan/backend/test/fixtures/state-of-hamilton/ballot.pdf'
);
const ballotRequiringPdfjsIntermediateCanvasPath = join(
  __dirname,
  '../../fixtures/data/electionGridLayoutNewHampshireHudson/template.pdf'
);

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
  const pdfBytes = await fs.readFile(
    ballotNotRequiringPdfjsIntermediateCanvasPath
  );
  assertHasPageCountAndSize(await iter(pdfToImages(pdfBytes)).toArray(), {
    pageCount: 6,
    size: {
      width: 612,
      height: 792,
    },
  });
});

test('can generate images with a different scale', async () => {
  const pdfBytes = await fs.readFile(
    ballotNotRequiringPdfjsIntermediateCanvasPath
  );
  assertHasPageCountAndSize(
    await iter(pdfToImages(pdfBytes, { scale: 2 })).toArray(),
    {
      pageCount: 6,
      size: { width: 1224, height: 1584 },
    }
  );
});

test('can render a PDF that requires the PDF.js intermediate canvas', async () => {
  const pdfBytes = await fs.readFile(
    ballotRequiringPdfjsIntermediateCanvasPath
  );
  assertHasPageCountAndSize(await iter(pdfToImages(pdfBytes)).toArray(), {
    pageCount: 2,
    size: { width: 684, height: 1080 },
  });
});

test('can configure the workerSrc', () => {
  setPdfRenderWorkerSrc('/pdf.worker.js');
  expect(GlobalWorkerOptions.workerSrc).toEqual('/pdf.worker.js');
});
