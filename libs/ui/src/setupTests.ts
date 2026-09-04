import { afterAll, beforeEach, expect, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import '@votingworks/fixtures/vitest-setup';
import '@votingworks/image-utils/vitest-setup';
import {
  buildToHaveStyleRule,
  type ToHaveStyleRuleMatchers,
} from 'vitest-styled-components';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Matchers<R, T> {
    toHaveStyleRule: ToHaveStyleRuleMatchers['toHaveStyleRule'];
  }
}

expect.extend({ toHaveStyleRule: buildToHaveStyleRule(expect) });

beforeEach(cleanup);

configure({ asyncUtilTimeout: 5_000 });

afterAll(() => {
  vi.useRealTimers();
});
