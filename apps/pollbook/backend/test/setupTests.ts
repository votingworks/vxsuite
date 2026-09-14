import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { cleanupCachedBrowser } from '@votingworks/printing/browser';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { makeIdFactory } from './id_helpers.js';
import '@votingworks/image-utils/vitest-setup';

// Deterministic ID generation
const idFactory = makeIdFactory();

afterAll(async () => {
  await cleanupCachedBrowser();
});

vi.mock(import('nanoid'), () => ({
  customAlphabet: () => () => idFactory.next(),
}));
beforeEach(() => idFactory.reset());

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
