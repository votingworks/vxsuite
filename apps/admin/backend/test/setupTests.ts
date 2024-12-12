import { afterAll } from 'vitest';
import { cleanupCachedBrowser } from '@votingworks/printing';
import { cleanupTestSuiteTmpFiles } from './cleanup';

afterAll(async () => {
  cleanupTestSuiteTmpFiles();
  await cleanupCachedBrowser();
});
