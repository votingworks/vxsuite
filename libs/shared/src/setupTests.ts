import fetchMock from 'fetch-mock';
import jestFetchMock from 'jest-fetch-mock';
import { clearImmediate, setImmediate } from 'timers';
import { TextDecoder, TextEncoder } from 'util';

beforeEach(() => {
  jestFetchMock.enableMocks();
  fetchMock.reset();
  fetchMock.mock();
});

globalThis.clearImmediate = clearImmediate;
globalThis.setImmediate = setImmediate;
globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
