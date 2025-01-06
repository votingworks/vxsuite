import { afterAll, beforeAll, beforeEach } from 'vitest';
import fetchMock from 'fetch-mock';
import { clearImmediate, setImmediate } from 'node:timers';
import { TextDecoder, TextEncoder } from 'node:util';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';

beforeEach(() => {
  fetchMock.reset();
  fetchMock.mock();
});

globalThis.clearImmediate = clearImmediate;
globalThis.setImmediate = setImmediate;
globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
