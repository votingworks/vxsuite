import { afterAll, afterEach, beforeEach, vi } from 'vitest';
import '@votingworks/test-utils/vitest-setup';
import '@votingworks/fixtures/vitest-setup';
import fetchMock from 'fetch-mock';
import { TextDecoder, TextEncoder } from 'node:util';
import { cleanup, configure } from './react_testing_library.js';
import '../src/polyfills.js';

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

afterAll(() => {
  vi.useRealTimers();
});
