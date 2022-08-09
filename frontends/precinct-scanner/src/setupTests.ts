import fetchMock from 'fetch-mock';
import jestFetchMock from 'jest-fetch-mock';
import '@testing-library/jest-dom/extend-expect';
import { TextDecoder, TextEncoder } from 'util';

beforeEach(() => {
  jestFetchMock.enableMocks();
  fetchMock.reset();
  fetchMock.mock();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
