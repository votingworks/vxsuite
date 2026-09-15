/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers.js';
import { cleanup, configure } from '@testing-library/react';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import {
  buildToHaveStyleRule,
  ToHaveStyleRuleMatchers,
} from 'vitest-styled-components';
import '@votingworks/image-utils/vitest-setup';

declare module 'vitest' {
  // vitest own `Assertion<T>` extends both `JestAssertion<T>` and
  // `ChaiMockAssertion`, which have non-identical `lastReturnedWith` /
  // `nthReturnedWith` signatures. Any declaration-merge into `Assertion`
  // triggers TypeScript to re-validate the merged interface and surface that
  // conflict (TS2320). Override the conflicting members here with a
  // signature compatible with both so the merge resolves cleanly.
  interface Assertion<T = any> {
    toHaveStyleRule: ToHaveStyleRuleMatchers['toHaveStyleRule'];
    lastReturnedWith<E = any>(value?: E): void;
    nthReturnedWith<E = any>(n: number, value?: E): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveStyleRule: ToHaveStyleRuleMatchers['toHaveStyleRule'];
  }
}

expect.extend({ toHaveStyleRule: buildToHaveStyleRule(expect) });
expect.extend(matchers);

beforeEach(cleanup);

configure({ asyncUtilTimeout: 5_000 });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

afterAll(() => {
  vi.useRealTimers();
});
