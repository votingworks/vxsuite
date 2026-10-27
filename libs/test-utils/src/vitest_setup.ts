import { expect, type MatchersObject } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import { blockifyDisplay } from './blockify_display.js';

declare module 'vitest' {
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars,
     @typescript-eslint/no-explicit-any */
  interface Matchers<R, T> extends TestingLibraryMatchers<any, R> {}
}

// The whole namespace is registered at once; its synthesized `default` is not
// a matcher.
/* eslint-disable-next-line vx/gts-direct-module-export-access-only */
expect.extend(matchers as unknown as MatchersObject);

// @coverage-exclude: only false outside a DOM test environment
if (typeof globalThis.getComputedStyle === 'function') {
  blockifyDisplay();
}
