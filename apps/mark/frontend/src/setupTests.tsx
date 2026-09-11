// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import fetchMock from 'fetch-mock';
import { TextDecoder, TextEncoder } from 'node:util';
import { cleanup, configure } from '../test/react_testing_library.js';
import './polyfills.js';

configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
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
globalThis.TextEncoder = TextEncoder;

// PointerEvent is not available in jsdom, so we polyfill it with MouseEvent
if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = MouseEvent as typeof PointerEvent;
}

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

afterAll(() => {
  vi.useRealTimers();
});
