import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import {
  buildToMatchPdfSnapshot,
  ToMatchPdfSnapshotOptions,
} from '@votingworks/image-utils';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import { makeIdFactory } from './id_helpers.js';

// Deterministic ID generation
const idFactory = makeIdFactory();

afterAll(async () => {
  // Loaded here rather than imported at module scope, for two reasons. Setup
  // files run before the test file, so an eager import would instantiate a
  // chunk of the dependency graph inside vitest's module runner *before* any
  // `vi.mock` is registered, and those modules would keep their real bindings.
  // And `importActual` resolves printing's own dependencies unmocked, so a test
  // that stubs `node:fs` does not break the printer configs it reads on import.
  // When nothing is mocked this is the same module instance the tests used, so
  // the browser it cleans up is the one they created.
  const { cleanupCachedBrowser } = await vi.importActual<
    typeof import('@votingworks/printing')
  >('@votingworks/printing');
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
