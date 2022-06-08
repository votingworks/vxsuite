import { promises as fs } from 'fs';
import { join } from 'path';
import { pdfToImages } from './pdf_to_images';

async function asyncIterableToArray<T>(
  iterable: AsyncIterable<T>
): Promise<T[]> {
  const result: T[] = [];

  for await (const value of iterable) {
    result.push(value);
  }

  return result;
}

const ballotNotRequiringPdfjsIntermediateCanvasPath = join(
  __dirname,
  '../../test/fixtures/state-of-hamilton/ballot.pdf'
);
const ballotRequiringPdfjsIntermediateCanvasPath = join(
  __dirname,
  '../../../../libs/ballot-interpreter-nh/test/fixtures/hudson-2020-11-03/template.pdf'
);

test('yields the right number of images sized correctly', async () => {
  const pdfBytes = await fs.readFile(
    ballotNotRequiringPdfjsIntermediateCanvasPath
  );
  const pages = await asyncIterableToArray(pdfToImages(pdfBytes));
  expect(pages.length).toEqual(5);

  const [
    {
      page: { width: width1, height: height1 },
    },
    {
      page: { width: width2, height: height2 },
    },
  ] = pages;
  expect({ width: width1, height: height1 }).toEqual({
    width: 612,
    height: 792,
  });
  expect({ width: width2, height: height2 }).toEqual({
    width: 612,
    height: 792,
  });
});

test('can generate images with a different scale', async () => {
  const pdfBytes = await fs.readFile(
    ballotNotRequiringPdfjsIntermediateCanvasPath
  );
  const [
    {
      page: { width, height },
    },
  ] = await asyncIterableToArray(pdfToImages(pdfBytes, { scale: 2 }));
  expect({ width, height }).toEqual({ width: 1224, height: 1584 });
});

test('can render a PDF that requires the PDF.js intermediate canvas', async () => {
  const pdfBytes = await fs.readFile(
    ballotRequiringPdfjsIntermediateCanvasPath
  );
  const pages = await asyncIterableToArray(pdfToImages(pdfBytes));
  expect(pages.length).toEqual(2);
});
