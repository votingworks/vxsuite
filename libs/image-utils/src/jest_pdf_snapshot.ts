import { readFile } from 'fs/promises';
import { tmpNameSync } from 'tmp';
import { Buffer } from 'buffer';
import { pdfToImages } from './pdf_to_images';
import { writeImageData } from './image_data';

/**
 * Custom `jest` matcher to compare a PDF to a snapshot. Accepts a buffer or
 * path to a PDF file. Converts the PDF to PNG files and uses
 * `jest-image-snapshot` to snapshot them.
 */
export async function toMatchPdfSnapshot(
  received: string | Buffer
): Promise<jest.CustomMatcherResult> {
  const pdfContents =
    typeof received === 'string' ? await readFile(received) : received;
  const pdfPages = pdfToImages(pdfContents, { scale: 200 / 72 });
  for await (const { page } of pdfPages) {
    const path = tmpNameSync({ postfix: '.png' });
    await writeImageData(path, page);
    const imageBuffer = await readFile(path);
    expect(imageBuffer).toMatchImageSnapshot();
  }

  return {
    pass: true,
    message: () => '',
  };
}
