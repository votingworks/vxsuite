import { expect } from 'vitest';
import {
  toMatchImageSnapshot,
  type MatchImageSnapshotOptions,
} from 'jest-image-snapshot';
import type { RgbaImageData } from '@votingworks/types';
import { toMatchImage, type ToMatchImageOptions } from './jest_match_image.js';
import {
  buildToMatchPdfSnapshot,
  type ToMatchPdfSnapshotOptions,
} from './jest_pdf_snapshot.js';

declare module 'vitest' {
  // `jest-image-snapshot` only declares its matcher on Jest's `jest.Matchers`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R, T> {
    toMatchImage(
      expected: RgbaImageData,
      options?: ToMatchImageOptions
    ): Promise<void>;
    toMatchImageSnapshot(options?: MatchImageSnapshotOptions): R;
    toMatchPdfSnapshot(options?: ToMatchPdfSnapshotOptions): Promise<void>;
  }
}

expect.extend({
  toMatchImage,
  toMatchImageSnapshot,
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect),
});
