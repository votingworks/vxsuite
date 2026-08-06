import matchers from '@testing-library/jest-dom/matchers';
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { TextDecoder, TextEncoder } from 'node:util';
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
