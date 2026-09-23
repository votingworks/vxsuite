import { beforeEach } from 'vitest';
import fetchMock from 'fetch-mock';
import { clearImmediate, setImmediate } from 'node:timers';
import { TextDecoder, TextEncoder } from 'node:util';
import '@votingworks/fixtures/vitest-setup';

beforeEach(() => {
  fetchMock.reset();
  fetchMock.mock();
});

globalThis.clearImmediate = clearImmediate;
globalThis.setImmediate = setImmediate;
globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder;
