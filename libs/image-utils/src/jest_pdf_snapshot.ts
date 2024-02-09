import { readFile } from 'fs/promises';
import { tmpNameSync } from 'tmp';
import { Buffer } from 'buffer';
import { pdfToImages } from './pdf_to_images';
import { writeImageData } from './image_data';

/**
 * Options for `toMatchPdfSnapshot`.
 */
export interface ToMatchPdfSnapshotOptions {
  /**
   * Provides an ID for a snapshot. Enables you to compare multiple PDFs to the
   * same snapshot, e.g. to confirm a preview and print are identical.
   */
  customSnapshotIdentifier?: string;
}

/**
 * Custom `jest` matcher to compare a PDF to a snapshot. Accepts a buffer or
 * path to a PDF file. Converts the PDF to PNG files and uses
 * `jest-image-snapshot` to snapshot them.
 */
export async function toMatchPdfSnapshot(
  received: string | Buffer,
  options: ToMatchPdfSnapshotOptions = {}
): Promise<jest.CustomMatcherResult> {
  const pdfContents =
    typeof received === 'string' ? await readFile(received) : received;
  const pdfPages = pdfToImages(pdfContents, { scale: 200 / 72 });
  for await (const { page, pageNumber } of pdfPages) {
    const path = tmpNameSync({ postfix: '.png' });
    await writeImageData(path, page);
    const imageBuffer = await readFile(path);
    expect(imageBuffer).toMatchImageSnapshot({
      customSnapshotIdentifier: options.customSnapshotIdentifier
        ? `${options.customSnapshotIdentifier}-${pageNumber}`
        : undefined,
    });
  }

  return {
    pass: true,
    message: () => '',
  };
}
