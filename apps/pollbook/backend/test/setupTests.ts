import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import type { ToMatchPdfSnapshotOptions } from '@votingworks/image-utils';
import { cleanupCachedBrowser } from '@votingworks/printing/browser';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import { makeIdFactory } from './id_helpers.js';

// Loaded with `importActual` rather than imported: this file runs before any
// `vi.mock` is registered, so a module-scope import would leave modules in
// image-utils's dependency graph holding unmocked bindings.
const { buildToMatchPdfSnapshot } = await vi.importActual<
  typeof import('@votingworks/image-utils')
>('@votingworks/image-utils');

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
