import { afterAll, vi } from 'vitest';
import '@votingworks/test-utils/vitest-setup';
import '@votingworks/fixtures/vitest-setup';
import { TextDecoder, TextEncoder } from 'node:util';
import { configure } from './react_testing_library.js';

configure({ asyncUtilTimeout: 5_000 });

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder;

afterAll(() => {
  vi.useRealTimers();
});
