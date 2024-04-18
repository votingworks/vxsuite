import 'jest-styled-components';
import '@testing-library/jest-dom/extend-expect';
import { TextDecoder, TextEncoder } from 'util';

import {
  expectTestToEndWithAllPrintsAsserted,
  mockPrintElement,
  mockPrintElementWhenReady,
  mockPrintElementToPdf,
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

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
