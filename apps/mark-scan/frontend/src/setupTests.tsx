// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import { afterEach, beforeEach, expect, vi } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import fetchMock from 'fetch-mock';
import { TextDecoder, TextEncoder } from 'node:util';
import { cleanup, configure } from '../test/react_testing_library';
import './polyfills';

expect.extend(matchers);

configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  globalThis.print = vi.fn(() => {
    throw new Error('globalThis.print() should never be called');
  });
});

beforeEach(() => {
  fetchMock.mock();
});

afterEach(() => {
  cleanup();
  fetchMock.restore();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
