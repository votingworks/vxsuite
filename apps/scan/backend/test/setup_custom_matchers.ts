import { expect } from 'vitest';
import { buildToMatchPdfSnapshot } from '@votingworks/image-utils';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

expect.extend({
  toMatchImageSnapshot,
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect),
});
