import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { afterAll, beforeAll, expect, vi } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import { TextDecoder, TextEncoder } from 'node:util';
import { configure } from '../test/react_testing_library.js';

declare module 'vitest' {
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars,
     @typescript-eslint/no-explicit-any */
  interface Matchers<R, T> extends TestingLibraryMatchers<any, R> {}
}

// `expect.extend` only accepts matchers whose arguments are `unknown[]`.
type MatcherImplementations = Parameters<typeof expect.extend>[0];

expect.extend(matchers as unknown as MatcherImplementations);

configure({ asyncUtilTimeout: 5_000 });

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder;

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

afterAll(() => {
  vi.useRealTimers();
});
