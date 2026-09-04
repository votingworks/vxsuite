import { afterAll, beforeAll, expect } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { buildToMatchPdfSnapshot } from '@votingworks/image-utils';
import { cleanupCachedBrowser } from '@votingworks/printing';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

afterAll(async () => {
  await cleanupCachedBrowser();
});

expect.extend({
  toMatchImageSnapshot,
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect),
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
