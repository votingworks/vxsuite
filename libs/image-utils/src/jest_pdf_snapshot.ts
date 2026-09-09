import type * as vitest from 'vitest';
import type { MatchImageSnapshotOptions } from 'jest-image-snapshot';
import { readFile } from 'node:fs/promises';
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
 * Builds a custom matcher to compare a PDF to a snapshot. The matcher
 * accepts a buffer or path to a PDF file. Converts the PDF to PNG files and
 * uses `jest-image-snapshot` to snapshot them.
 */
export function buildToMatchPdfSnapshot(
  expect: typeof vitest.expect
): vitest.Matcher<vitest.MatcherState, [options?: ToMatchPdfSnapshotOptions]> {
  return async (received: string | Uint8Array, options = {}) => {
    const pdfContents =
      typeof received === 'string'
        ? Uint8Array.from(await readFile(received))
        : received;
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
  };
}

declare module 'vitest' {
  // `jest-image-snapshot` only declares its matcher on Jest's `jest.Matchers`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R, T> {
    toMatchImageSnapshot(options?: MatchImageSnapshotOptions): R;
    toMatchPdfSnapshot(options?: ToMatchPdfSnapshotOptions): Promise<void>;
  }
}
