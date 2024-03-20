import { iter } from '@votingworks/basics';
import { electionGridLayoutNewHampshireHudsonFixtures } from '@votingworks/fixtures';
import { Size } from '@votingworks/types';
import { GlobalWorkerOptions } from 'pdfjs-dist';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  PdfPage,
  parsePdf,
  pdfToImages,
  setPdfRenderWorkerSrc,
} from './pdf_to_images';
import { loadImageData } from './image_data';

const pdfNotRequiringPdfjsIntermediateCanvasBuffer = readFileSync(
  join(
    __dirname,
    '../test/fixtures/pdf-not-requiring-pdfjs-intermediate-canvas.pdf'
  )
);
const pdfRequiringPdfjsIntermediateCanvasBuffer =
  electionGridLayoutNewHampshireHudsonFixtures.templatePdf.asBuffer();

async function assertHasPageCountAndSize(
  pages: PdfPage[],
  { pageCount, size }: { pageCount: number; size: Size }
): Promise<void> {
  expect(pages).toHaveLength(pageCount);
  for (const { page } of pages) {
    const { width, height } = await loadImageData(page);
    expect({ width, height }).toMatchObject(size);
  }
}

test('yields the right number of images sized correctly', async () => {
  await assertHasPageCountAndSize(
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
  await assertHasPageCountAndSize(
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
  await assertHasPageCountAndSize(
    await iter(
      pdfToImages(pdfRequiringPdfjsIntermediateCanvasBuffer)
    ).toArray(),
    {
      pageCount: 2,
      size: { width: 684, height: 1080 },
    }
  );
});

test('can output JPGs', async () => {
  await assertHasPageCountAndSize(
    await iter(
      pdfToImages(pdfNotRequiringPdfjsIntermediateCanvasBuffer, {
        mimetype: 'image/jpeg',
      })
    ).toArray(),
    {
      pageCount: 6,
      size: { width: 612, height: 792 },
    }
  );
});

test('can configure the workerSrc', () => {
  setPdfRenderWorkerSrc('/pdf.worker.js');
  expect(GlobalWorkerOptions.workerSrc).toEqual('/pdf.worker.js');
});

test('parsePdf', async () => {
  const pdf = await parsePdf(pdfNotRequiringPdfjsIntermediateCanvasBuffer);
  expect(pdf.numPages).toEqual(6);
});
