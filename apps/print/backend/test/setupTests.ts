import { afterAll, beforeAll, expect, vi } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import type { ToMatchPdfSnapshotOptions } from '@votingworks/image-utils';
import { cleanupCachedBrowser } from '@votingworks/printing/browser';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

// Loaded with `importActual` rather than imported: this file runs before any
// `vi.mock` is registered, so a module-scope import would leave modules in
// image-utils's dependency graph holding unmocked bindings.
const { buildToMatchPdfSnapshot } = await vi.importActual<
  typeof import('@votingworks/image-utils')
>('@votingworks/image-utils');

afterAll(async () => {
  await cleanupCachedBrowser();
});

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
