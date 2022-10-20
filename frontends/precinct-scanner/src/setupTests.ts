import fetchMock from 'fetch-mock';
import jestFetchMock from 'jest-fetch-mock';
import '@testing-library/jest-dom/extend-expect';
import { TextDecoder, TextEncoder } from 'util';

import { configure } from '@testing-library/react';
import { expectAllPrintsTested } from '@votingworks/test-utils';

configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  jestFetchMock.enableMocks();
  fetchMock.reset();
  fetchMock.mock();
});

afterEach(() => {
  expectAllPrintsTested();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
