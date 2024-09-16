import { readFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { pdfToImages } from './pdf_to_images';
import { toImageBuffer } from './image_data';

/**
 * Options for `toMatchPdfSnapshot`.
 */
export interface ToMatchPdfSnapshotOptions {
  /**
   * Provides an ID for a snapshot. Enables you to compare multiple PDFs to the
   * same snapshot, e.g. to confirm a preview and print are identical.
   */
  customSnapshotIdentifier?: string;

  /**
   * The allowable difference between snapshots interpreted as percent.
   * See: https://github.com/americanexpress/jest-image-snapshot
   */
  failureThreshold?: number;
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
    const imageBuffer = toImageBuffer(page);
    expect(imageBuffer).toMatchImageSnapshot({
      failureThreshold: options.failureThreshold ?? 0,
      failureThresholdType: 'percent',
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
