import { afterAll, afterEach, vi } from 'vitest';
import '@votingworks/fixtures/vitest-setup';
import '@votingworks/test-utils/vitest-setup';
import { cleanup, configure } from './react_testing_library.js';

configure({ asyncUtilTimeout: 5_000, reactStrictMode: true });

afterEach(() => {
  cleanup();
});

// Not implemented in jsdom:
HTMLElement.prototype.scrollIntoView = vi.fn();

afterAll(() => {
  vi.useRealTimers();
});
