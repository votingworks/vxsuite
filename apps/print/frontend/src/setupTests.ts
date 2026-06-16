import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { afterAll, beforeAll, expect } from 'vitest';
import matchers from '@testing-library/jest-dom/matchers';
import { TextDecoder, TextEncoder } from 'node:util';

expect.extend(matchers);

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
