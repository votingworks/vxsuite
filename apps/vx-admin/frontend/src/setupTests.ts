// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom/extend-expect';
import 'jest-styled-components';
import { configure } from '@testing-library/react';
import {
  expectTestToEndWithAllPrintsAsserted,
  fakePrintElement as mockPrintElement,
  fakePrintElementWhenReady as mockPrintElementWhenReady,
  suppressReact17UnmountedWarning,
} from '@votingworks/test-utils';

configure({ asyncUtilTimeout: 5_000 });
suppressReact17UnmountedWarning();

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
