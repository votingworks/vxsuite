import { afterAll, beforeAll } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { cleanupCachedBrowser } from '@votingworks/printing/browser';
import { setGracefulCleanup } from 'tmp';
import '@votingworks/image-utils/vitest-setup';

// ensure tmp files are cleaned up
setGracefulCleanup();

afterAll(async () => {
  await cleanupCachedBrowser();
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
