import { configure } from '@testing-library/react';
import fetchMock from 'fetch-mock';
import jestFetchMock from 'jest-fetch-mock';
import { TextDecoder, TextEncoder } from 'util';

configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  jestFetchMock.enableMocks();
  fetchMock.reset();
  fetchMock.mock();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
