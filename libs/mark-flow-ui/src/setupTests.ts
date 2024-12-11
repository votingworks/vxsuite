import { afterEach, beforeEach, expect, vi } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '@testing-library/react';

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
