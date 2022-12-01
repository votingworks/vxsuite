import fetchMock from 'fetch-mock';
import jestFetchMock from 'jest-fetch-mock';
import 'jest-styled-components';
import '@testing-library/jest-dom/extend-expect';
import { TextDecoder, TextEncoder } from 'util';

import { configure } from '@testing-library/react';
import {
  expectTestToEndWithAllPrintsAsserted,
  fakePrintElement,
  fakePrintElementWhenReady,
} from '@votingworks/test-utils';

configure({ asyncUtilTimeout: 5_000 });

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => {
  const original = jest.requireActual('@votingworks/ui');
  return {
    ...original,
    printElementWhenReady: fakePrintElementWhenReady,
    printElement: fakePrintElement,
  };
});

beforeEach(() => {
  jestFetchMock.enableMocks();
  fetchMock.reset();
  fetchMock.mock();
});

afterEach(() => {
  expectTestToEndWithAllPrintsAsserted();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
