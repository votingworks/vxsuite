/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import '@votingworks/image-utils/vitest-setup';
import {
  buildToHaveStyleRule,
  ToHaveStyleRuleMatchers,
} from 'vitest-styled-components';

declare module 'vitest' {
  // vitest own `Assertion<T>` extends both `JestAssertion<T>` and
  // `ChaiMockAssertion`, which have non-identical `lastReturnedWith` /
  // `nthReturnedWith` signatures. Any declaration-merge into `Assertion`
  // triggers TypeScript to re-validate the merged interface and surface that
  // conflict (TS2320). Override the conflicting members here with a
  // signature compatible with both so the merge resolves cleanly.
  interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {
    toHaveStyleRule: ToHaveStyleRuleMatchers['toHaveStyleRule'];
    lastReturnedWith<E = any>(value?: E): void;
    nthReturnedWith<E = any>(n: number, value?: E): void;
  }
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<
    any,
    any
  > {
    toHaveStyleRule: ToHaveStyleRuleMatchers['toHaveStyleRule'];
  }
}

expect.extend({ toHaveStyleRule: buildToHaveStyleRule(expect) });

beforeEach(cleanup);

configure({ asyncUtilTimeout: 5_000 });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

afterAll(() => {
  vi.useRealTimers();
});
