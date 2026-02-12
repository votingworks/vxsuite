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
  ToMatchPdfSnapshotOptions,
  buildToMatchPdfSnapshot,
} from '@votingworks/image-utils';
import { toMatchImageSnapshot } from 'jest-image-snapshot';
import {
  buildToHaveStyleRule,
  ToHaveStyleRuleMatchers,
} from 'vitest-styled-components';

declare module 'vitest' {
  interface Assertion<T = any> extends ToHaveStyleRuleMatchers {}
  interface AsymmetricMatchersContaining extends ToHaveStyleRuleMatchers {}
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toMatchPdfSnapshot(options?: ToMatchPdfSnapshotOptions): Promise<R>;
    }
  }
}

expect.extend({ toHaveStyleRule: buildToHaveStyleRule(expect) });
expect.extend(matchers);
expect.extend({
  toMatchImageSnapshot,
  toMatchPdfSnapshot: buildToMatchPdfSnapshot(expect as any),
});

beforeEach(cleanup);

configure({ asyncUtilTimeout: 5_000 });

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
