import { expect } from 'vitest';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import { toMatchImage } from './jest_match_image.js';
import { buildToMatchPdfSnapshot } from './jest_pdf_snapshot.js';

export type { ToMatchImageOptions } from './jest_match_image.js';
export type { ToMatchPdfSnapshotOptions } from './jest_pdf_snapshot.js';

expect.extend({
  toMatchImage,
  toMatchImageSnapshot,
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect),
});
