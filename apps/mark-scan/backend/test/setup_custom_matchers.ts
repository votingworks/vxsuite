import { expect } from 'vitest';
import {
  ToMatchImageOptions,
  ToMatchPdfSnapshotOptions,
  toMatchImage,
  buildToMatchPdfSnapshot,
} from '@votingworks/image-utils';
import { RgbaImageData } from '@votingworks/types';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import { setGracefulCleanup } from 'tmp';

// ensure tmp files are cleaned up
setGracefulCleanup();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toMatchPdfSnapshot(options?: ToMatchPdfSnapshotOptions): Promise<R>;
      toMatchImage(
        expected: RgbaImageData,
        options?: ToMatchImageOptions
      ): Promise<R>;
    }
  }
}

expect.extend({
  toMatchImageSnapshot,
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect),
  toMatchImage,
});
