import '@testing-library/jest-dom/extend-expect';
import fetchMock from 'fetch-mock';
import jestFetchMock from 'jest-fetch-mock';
import 'jest-styled-components';
import { TextDecoder, TextEncoder } from 'util';
import { configure } from '../test/react_testing_library';

configure({ asyncUtilTimeout: 5_000 });

beforeEach(() => {
  jestFetchMock.enableMocks();
  fetchMock.reset();
  fetchMock.mock();
});

jest.mock('styled-components', () =>
  jest.requireActual('styled-components/dist/styled-components.browser.cjs.js')
);

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
