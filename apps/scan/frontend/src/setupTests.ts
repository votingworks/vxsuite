import { afterAll, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import '@votingworks/fixtures/vitest-setup';
import '@votingworks/ui/vitest-setup';
import { TextDecoder, TextEncoder } from 'node:util';
import { configure } from '../test/react_testing_library.js';

configure({ asyncUtilTimeout: 5_000 });

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder;

afterAll(() => {
  vi.useRealTimers();
});
