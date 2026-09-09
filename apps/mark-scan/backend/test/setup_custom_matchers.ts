import { expect } from 'vitest';
import {
  toMatchImage,
  buildToMatchPdfSnapshot,
} from '@votingworks/image-utils';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import { setGracefulCleanup } from 'tmp';

// ensure tmp files are cleaned up
setGracefulCleanup();

expect.extend({
  toMatchImageSnapshot,
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect),
  toMatchImage,
});
