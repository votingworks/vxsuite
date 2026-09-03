// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import { afterAll, afterEach, beforeEach, expect, vi } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import { notifyManager } from '@tanstack/react-query';
import fetchMock from 'fetch-mock';
import { TextDecoder, TextEncoder } from 'node:util';
import { cleanup, configure } from '../test/react_testing_library.js';
import './polyfills.js';

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
globalThis.TextEncoder = TextEncoder;

// PointerEvent is not available in jsdom, so we polyfill it with MouseEvent
if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = MouseEvent as typeof PointerEvent;
}

afterAll(() => {
  vi.useRealTimers();
});

// react-query v5 defers its subscriber notifications by a scheduler tick,
// where v4 delivered them synchronously. Tests that click a control as soon
// as it renders would otherwise act on stale (still-loading) state. Flushing
// synchronously restores the v4 timing for tests only.
notifyManager.setScheduler((cb) => cb());
