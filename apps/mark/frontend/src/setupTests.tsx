// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import fetchMock from 'fetch-mock';
import { TextDecoder, TextEncoder } from 'node:util';
import { cleanup, configure } from '../test/react_testing_library';
import './polyfills';

expect.extend(matchers);
configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  // react-gamepad calls this function which does not exist in JSDOM
  globalThis.navigator.getGamepads = vi.fn(() => []);
  globalThis.print = vi.fn(() => {
    throw new Error('globalThis.print() should never be called');
  });
  cleanup();
});

beforeEach(() => {
  fetchMock.mock();
});

afterEach(() => {
  fetchMock.restore();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
