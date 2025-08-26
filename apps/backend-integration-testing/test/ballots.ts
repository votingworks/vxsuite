import { assert } from '@votingworks/basics';
import {
  createImageData,
  ImageData,
  pdfToImages,
} from '@votingworks/image-utils';
import { SheetOf } from '@votingworks/types';
import { readFile } from 'node:fs/promises';

/**
 * Creates a blank ImageData object of the same dimensions as the input ImageData.
 * The resulting image will be completely white (all pixels set to white with full opacity).
 *
 * @param sourceImageData - The source ImageData object to match dimensions from
 * @returns A new blank ImageData object with the same width and height as the source
 */
export function createBlankImageData(sourceImageData: ImageData): ImageData {
  const { width, height } = sourceImageData;

  // Create a new ImageData object with the same dimensions
  const blankImageData = createImageData(width, height);

  // Fill the data array with white pixels (255, 255, 255, 255) for RGBA
  // Each pixel has 4 values: Red, Green, Blue, Alpha
  for (let i = 0; i < blankImageData.data.length; i += 4) {
    blankImageData.data[i] = 255; // Red
    blankImageData.data[i + 1] = 255; // Green
    blankImageData.data[i + 2] = 255; // Blue
    blankImageData.data[i + 3] = 255; // Alpha (fully opaque)
  }

  return blankImageData;
}

/**
 * Loads a PDF file, extracts ImageData from its pages using pdfToImages,
 * creates blank versions of those images, and returns them as a SheetOf<ImageData>.
 *
 * @param pdfPath - Path to the PDF file to process
 * @returns A promise that resolves to a SheetOf<ImageData> containing blank versions
 *          of the first two pages of the PDF (front and back of a ballot sheet)
 * @throws Error if the PDF doesn't have at least 2 pages
 */
export async function bmdImageDataFromPdf(
  pdfPath: string
): Promise<SheetOf<ImageData>> {
  // Read the PDF file from the filesystem
  const pdfBytes = Uint8Array.from(await readFile(pdfPath));

  // Extract ImageData from PDF pages
  const pages: ImageData[] = [];
  for await (const pdfPage of pdfToImages(pdfBytes)) {
    pages.push(pdfPage.page);
  }

  const firstPage = pages[0];
  assert(pages.length === 1, 'BMD ballot must have exactly one page');
  assert(firstPage);
  const blankBackImageData = createBlankImageData(firstPage);

  // Return as SheetOf<ImageData> (tuple of front and back)
  return [firstPage, blankBackImageData] as const;
}
