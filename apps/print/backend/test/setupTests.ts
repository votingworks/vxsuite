import { afterAll, beforeAll } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { cleanupCachedBrowser } from '@votingworks/printing';

afterAll(async () => {
  await cleanupCachedBrowser();
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
