import { afterAll, beforeAll } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { setGracefulCleanup } from 'tmp';
import '@votingworks/image-utils/vitest-setup';
import '@votingworks/printing/vitest-setup';

// ensure tmp files are cleaned up
setGracefulCleanup();

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
