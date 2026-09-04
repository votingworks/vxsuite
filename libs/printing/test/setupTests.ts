import { afterAll, beforeAll, expect } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { buildToMatchPdfSnapshot } from '@votingworks/image-utils';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

expect.extend({
  toMatchImageSnapshot,
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect),
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
