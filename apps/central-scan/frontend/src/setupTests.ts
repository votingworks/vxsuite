import { beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import '@votingworks/fixtures/vitest-setup';
import { TextDecoder, TextEncoder } from 'node:util';
import { cleanup, configure } from '../test/react_testing_library.js';

configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder;
