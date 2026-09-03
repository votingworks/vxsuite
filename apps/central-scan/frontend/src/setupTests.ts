import matchers from '@testing-library/jest-dom/matchers';
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { TextDecoder, TextEncoder } from 'node:util';
import { notifyManager } from '@tanstack/react-query';
import { cleanup, configure } from '../test/react_testing_library.js';

expect.extend(matchers);

configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder;

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

// react-query v5 defers its subscriber notifications by a scheduler tick,
// where v4 delivered them synchronously. Tests that click a control as soon
// as it renders would otherwise act on stale (still-loading) state. Flushing
// synchronously restores the v4 timing for tests only.
notifyManager.setScheduler((cb) => cb());
