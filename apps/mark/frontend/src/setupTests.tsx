// https://til.hashrocket.com/posts/hzqwty5ykx-create-react-app-has-a-default-test-setup-file

import '@testing-library/jest-dom/extend-expect';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import fetchMock from 'fetch-mock';
import 'jest-styled-components';
import { TextDecoder, TextEncoder } from 'node:util';
import { configure } from '../test/react_testing_library';
import './polyfills';

configure({ asyncUtilTimeout: 5_000 });

// styled-components version 5.3.1 and above requires this remapping for jest
// environments, reference: https://github.com/styled-components/styled-components/issues/3570
jest.mock('styled-components', () =>
  jest.requireActual('styled-components/dist/styled-components.browser.cjs.js')
);

beforeEach(() => {
  // react-gamepad calls this function which does not exist in JSDOM
  globalThis.navigator.getGamepads = jest.fn(() => []);
  globalThis.print = jest.fn(() => {
    throw new Error('globalThis.print() should never be called');
  });
});

beforeEach(() => {
  fetchMock.mock();
});

afterEach(() => {
  fetchMock.restore();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
