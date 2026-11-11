import { Buffer } from 'node:buffer';
import { assertDefined } from '@votingworks/basics';
import { expect } from 'vitest';
import type { PdfPreview } from '../src/reports/pdf_preview.js';

/** Compares preview pages with the image snapshots `toMatchPdfSnapshot` writes. */
export function expectPdfPreviewToMatchSnapshot(
  preview: PdfPreview | undefined,
  {
    customSnapshotIdentifier,
    failureThreshold,
  }: { customSnapshotIdentifier: string; failureThreshold: number }
): void {
  const { pageCount, pages } = assertDefined(preview);
  expect(pages).toHaveLength(pageCount);
  for (const [index, { png }] of pages.entries()) {
    expect(Buffer.from(png)).toMatchImageSnapshot({
      customSnapshotIdentifier: `${customSnapshotIdentifier}-${index + 1}`,
      failureThreshold,
      failureThresholdType: 'percent',
    });
  }
}
