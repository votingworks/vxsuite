import '@testing-library/jest-dom/extend-expect';
import 'jest-styled-components';
import { configure } from '@testing-library/react';
import {
  mockPrintElement,
  mockPrintElementWhenReady,
} from '@votingworks/test-utils';

configure({ asyncUtilTimeout: 5_000 });

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => {
  const original = jest.requireActual('@votingworks/ui');
  return {
    ...original,
    printElementWhenReady: mockPrintElementWhenReady,
    printElement: mockPrintElement,
  };
});

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
