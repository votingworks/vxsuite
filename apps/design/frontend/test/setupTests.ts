import '@testing-library/jest-dom/extend-expect';
import 'jest-styled-components';

import { TextEncoder } from 'node:util';
import { makeIdFactory } from './id_helpers';

// styled-components version 5.3.1 and above requires this remapping for jest
// environments, reference: https://github.com/styled-components/styled-components/issues/3570
jest.mock('styled-components', () =>
  jest.requireActual('styled-components/dist/styled-components.browser.cjs.js')
);

// Deterministic ID generation
const idFactory = makeIdFactory();

beforeEach(() => {
  idFactory.reset();
});

jest.mock('nanoid', () => {
  return {
    customAlphabet: () => () => {
      return idFactory.next();
    },
  };
});

global.TextEncoder = TextEncoder;
