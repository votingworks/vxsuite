import matchers from '@testing-library/jest-dom/matchers';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import { afterAll, expect, vi } from 'vitest';

declare module 'vitest' {
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars,
     @typescript-eslint/no-explicit-any */
  interface Matchers<R, T> extends TestingLibraryMatchers<any, R> {}
}

// `expect.extend` only accepts matchers whose arguments are `unknown[]`.
type MatcherImplementations = Parameters<typeof expect.extend>[0];

expect.extend(matchers as unknown as MatcherImplementations);

afterAll(() => {
  vi.useRealTimers();
});
