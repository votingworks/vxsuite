// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/extend-expect';
import 'jest-styled-components';
import {
  expectTestToEndWithAllPrintsAsserted,
  fakePrintElement as mockPrintElement,
  fakePrintElementWhenReady as mockPrintElementWhenReady,
  fakePrintElementToPdf as mockPrintElementToPdf,
} from '@votingworks/test-utils';
import { configure } from '../test/react_testing_library';

configure({ asyncUtilTimeout: 5_000 });

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => {
  const original = jest.requireActual('@votingworks/ui');
  return {
    ...original,
    printElementWhenReady: mockPrintElementWhenReady,
    printElement: mockPrintElement,
    printElementToPdf: mockPrintElementToPdf,
  };
});

afterEach(() => {
  expectTestToEndWithAllPrintsAsserted();
});

// styled-components version 5.3.1 and above requires this remapping for jest
// environments, reference: https://github.com/styled-components/styled-components/issues/3570
jest.mock('styled-components', () =>
  jest.requireActual('styled-components/dist/styled-components.browser.cjs.js')
);
