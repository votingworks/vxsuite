// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/extend-expect';
import { configure } from '@testing-library/react';
import {
  expectTestToEndWithAllPrintsAsserted,
  fakePrintElement as mockPrintElement,
  fakePrintElementWhenReady as mockPrintElementWhenReady,
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

afterEach(() => {
  expectTestToEndWithAllPrintsAsserted();
});
