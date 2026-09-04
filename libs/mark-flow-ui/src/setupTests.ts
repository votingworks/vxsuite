import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import { configure } from '@testing-library/react';

declare module 'vitest' {
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars,
     @typescript-eslint/no-explicit-any */
  interface Matchers<R, T> extends TestingLibraryMatchers<any, R> {}
}

// `expect.extend` only accepts matchers whose arguments are `unknown[]`.
type MatcherImplementations = Parameters<typeof expect.extend>[0];

expect.extend(matchers as unknown as MatcherImplementations);

configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  globalThis.print = vi.fn(() => {
    throw new Error('globalThis.print() should never be called');
  });
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
