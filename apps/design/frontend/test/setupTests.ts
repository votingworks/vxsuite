import '@testing-library/jest-dom/extend-expect';
import 'jest-styled-components';

import { TextEncoder } from 'node:util';

// styled-components version 5.3.1 and above requires this remapping for jest
// environments, reference: https://github.com/styled-components/styled-components/issues/3570
jest.mock('styled-components', () =>
  jest.requireActual('styled-components/dist/styled-components.browser.cjs.js')
);

global.TextEncoder = TextEncoder;
