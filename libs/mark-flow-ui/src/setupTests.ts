import { afterEach, beforeEach, expect, vi } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';

// eslint-disable-next-line vx/gts-direct-module-export-access-only
expect.extend(matchers);

configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  // react-gamepad calls this function which does not exist in JSDOM
  globalThis.navigator.getGamepads = vi.fn(() => []);
  globalThis.print = vi.fn(() => {
    throw new Error('globalThis.print() should never be called');
  });
});

afterEach(cleanup);
