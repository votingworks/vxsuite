import { afterAll, beforeAll, expect, vi } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

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

expect.extend({ toMatchImageSnapshot });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
