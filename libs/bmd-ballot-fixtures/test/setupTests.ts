import { afterAll, beforeAll, expect } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { cleanupCachedBrowser } from '@votingworks/printing/browser';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

afterAll(async () => {
  await cleanupCachedBrowser();
});

expect.extend({ toMatchImageSnapshot });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
