import { afterAll, beforeAll } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { cleanupCachedBrowser } from '@votingworks/printing/browser';

afterAll(async () => {
  await cleanupCachedBrowser();
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
