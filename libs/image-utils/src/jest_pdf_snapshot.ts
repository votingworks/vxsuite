import type * as vitest from 'vitest';
import { assert } from '@votingworks/basics';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { getPdfPageCount, pdfToImages } from './pdf_to_images.js';
import { toImageBuffer } from './image_data.js';
import { normalizePdf } from './normalize_pdf.js';

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

/** Directory beside the test file holding the PDF snapshots. */
export const PDF_SNAPSHOTS_DIR = '__pdf_snapshots__';

interface SnapshotStateInternals {
  _counters: Map<string, number>;
  _updateSnapshot: 'all' | 'new' | 'none';
}

function kebabCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Builds a custom matcher to compare a PDF to a snapshot. The matcher
 * accepts a buffer or path to a PDF file.
 *
 * Passes immediately if the PDF, once normalized with `normalizePdf`, is
 * byte-identical to the stored PDF snapshot. Otherwise it converts the PDF to
 * PNG files and uses `jest-image-snapshot` to snapshot them page by page. The
 * normalized PDF is stored when there is no PDF snapshot yet or when updating
 * snapshots, so later runs take the fast path. Any other slow-path run logs a
 * warning.
 */
export function buildToMatchPdfSnapshot(
  expect: typeof vitest.expect
): (
  this: vitest.MatcherState,
  received: string | Uint8Array,
  options?: ToMatchPdfSnapshotOptions
) => Promise<jest.CustomMatcherResult> {
  return async function toMatchPdfSnapshot(received, options = {}) {
    const { testPath, currentTestName, snapshotState } = this;
    assert(testPath !== undefined && currentTestName !== undefined);
    const { _counters: counters, _updateSnapshot: updateSnapshot } =
      snapshotState as unknown as SnapshotStateInternals;

    const pdfContents = normalizePdf(
      typeof received === 'string' ? await readFile(received) : received
    );

    const nextCounter = (counters.get(currentTestName) ?? 0) + 1;
    const pdfSnapshotPath = join(
      dirname(testPath),
      PDF_SNAPSHOTS_DIR,
      `${
        options.customSnapshotIdentifier ??
        kebabCase(`${basename(testPath)}-${currentTestName}-${nextCounter}`)
      }.pdf`
    );

    const hasPdfSnapshot = existsSync(pdfSnapshotPath);
    if (updateSnapshot !== 'all' && hasPdfSnapshot) {
      const pdfSnapshot = await readFile(pdfSnapshotPath);
      if (pdfSnapshot.equals(pdfContents)) {
        // `toMatchImageSnapshot` numbers snapshots by counting calls within a
        // test, so skipping the per-page calls must still advance the count.
        // pdfjs detaches the bytes it is given, hence the copy.
        const pageCount = await getPdfPageCount(new Uint8Array(pdfContents));
        counters.set(currentTestName, nextCounter - 1 + pageCount);
        return { pass: true, message: () => '' };
      }
    }

    const pdfPages = pdfToImages(new Uint8Array(pdfContents), {
      scale: 200 / 72,
    });
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

    if (
      updateSnapshot === 'all' ||
      (updateSnapshot === 'new' && !hasPdfSnapshot)
    ) {
      await mkdir(dirname(pdfSnapshotPath), { recursive: true });
      await writeFile(pdfSnapshotPath, pdfContents);
    } else if (hasPdfSnapshot) {
      // eslint-disable-next-line no-console
      console.warn(
        `PDF snapshot matched visually but not byte-for-byte, so the slow ` +
          `page-by-page comparison ran: ${pdfSnapshotPath}\n` +
          `Either the PDF output is nondeterministic or the renderer changed. ` +
          `Run the test with -u to refresh the PDF snapshot.`
      );
    } else {
      // eslint-disable-next-line no-console
      console.warn(
        `No PDF snapshot to compare against, so the slow page-by-page ` +
          `comparison ran: ${pdfSnapshotPath}\n` +
          `Snapshot updates are disabled (CI), so it was not written. ` +
          `Commit the PDF snapshot from a local run to enable the fast path.`
      );
    }

    return {
      pass: true,
      message: () => '',
    };
  };
}
