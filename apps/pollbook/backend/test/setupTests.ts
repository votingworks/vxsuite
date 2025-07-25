import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import {
  buildToMatchPdfSnapshot,
  ToMatchPdfSnapshotOptions,
} from '@votingworks/image-utils';
import { cleanupCachedBrowser } from '@votingworks/printing';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import { makeIdFactory } from './id_helpers';

// Deterministic ID generation
const idFactory = makeIdFactory();

afterAll(async () => {
  await cleanupCachedBrowser();
});

vi.mock(import('nanoid'), () => ({
  customAlphabet: () => () => idFactory.next(),
}));
beforeEach(() => idFactory.reset());

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toMatchPdfSnapshot(options?: ToMatchPdfSnapshotOptions): Promise<R>;
    }
  }
}

expect.extend({
  toMatchImageSnapshot,
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect),
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
