import { afterAll, beforeAll } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { cleanupCachedBrowser } from '@votingworks/printing';
import { cleanupTestSuiteTmpFiles } from './cleanup.js';

afterAll(async () => {
  cleanupTestSuiteTmpFiles();
  await cleanupCachedBrowser();
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
