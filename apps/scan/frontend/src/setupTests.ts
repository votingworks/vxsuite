import 'jest-styled-components';
import '@testing-library/jest-dom/extend-expect';
import { TextDecoder, TextEncoder } from 'util';

import {
  expectTestToEndWithAllPrintsAsserted,
  fakePrintElement,
  fakePrintElementWhenReady,
} from '@votingworks/test-utils';
import { configure } from '../test/react_testing_library';

configure({ asyncUtilTimeout: 5_000 });

jest.mock('@votingworks/ui', (): typeof import('@votingworks/ui') => {
  const original = jest.requireActual('@votingworks/ui');
  return {
    ...original,
    printElementWhenReady: fakePrintElementWhenReady,
    printElement: fakePrintElement,
  };
});

jest.mock('styled-components', () =>
  jest.requireActual('styled-components/dist/styled-components.browser.cjs.js')
);

afterEach(() => {
  expectTestToEndWithAllPrintsAsserted();
});

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
