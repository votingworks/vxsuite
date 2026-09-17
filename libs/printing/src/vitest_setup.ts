// @coverage-exclude-file: used by other packages' vitest setup files
import { afterAll } from 'vitest';
import { cleanupCachedBrowser } from './browser.js';

afterAll(async () => {
  await cleanupCachedBrowser();
});
