import { expect } from 'vitest';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import type { RgbaImageData } from '@votingworks/types';
import { toMatchImage, type ToMatchImageOptions } from './jest_match_image.js';
import {
  buildToMatchPdfSnapshot,
  type ToMatchPdfSnapshotOptions,
} from './jest_pdf_snapshot.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toMatchImage(
        expected: RgbaImageData,
        options?: ToMatchImageOptions
      ): Promise<R>;
      toMatchPdfSnapshot(options?: ToMatchPdfSnapshotOptions): Promise<R>;
    }
  }
}

expect.extend({
  toMatchImage,
  toMatchImageSnapshot,
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect),
});
