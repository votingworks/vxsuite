import { expect, vi } from 'vitest';
import type { ToMatchPdfSnapshotOptions } from '@votingworks/image-utils';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

// Loaded with `importActual` rather than imported: this file runs before any
// `vi.mock` is registered, so a module-scope import would instantiate
// image-utils's dependency graph inside vitest's module runner too early and
// leave those modules holding unmocked bindings for the rest of the run.
const { buildToMatchPdfSnapshot } = await vi.importActual<
  typeof import('@votingworks/image-utils')
>('@votingworks/image-utils');

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
