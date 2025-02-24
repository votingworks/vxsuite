/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { afterAll, beforeAll, beforeEach, expect } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import {
  buildToHaveStyleRule,
  ToHaveStyleRuleMatchers,
} from 'vitest-styled-components';

declare module 'vitest' {
  interface Assertion<T = any> extends ToHaveStyleRuleMatchers {}
  interface AsymmetricMatchersContaining extends ToHaveStyleRuleMatchers {}
}

expect.extend({ toHaveStyleRule: buildToHaveStyleRule(expect) });
expect.extend(matchers);

beforeEach(cleanup);

configure({ asyncUtilTimeout: 5_000 });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
