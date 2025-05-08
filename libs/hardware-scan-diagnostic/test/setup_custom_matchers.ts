import { expect } from 'vitest';
import {
  ImageData,
  ToMatchImageOptions,
  ToMatchPdfSnapshotOptions,
  toMatchImage,
  buildToMatchPdfSnapshot,
} from '@votingworks/image-utils';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toMatchPdfSnapshot(options?: ToMatchPdfSnapshotOptions): Promise<R>;
      toMatchImage(
        expected: ImageData,
        options?: ToMatchImageOptions
      ): Promise<R>;
    }
  }
}

expect.extend({
  toMatchImageSnapshot,
  // Suppress type check issues during the vitest v2 → v3 migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect as any),
  toMatchImage,
});
