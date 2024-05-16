import 'jest-styled-components';
import '@testing-library/jest-dom/extend-expect';
import { TextDecoder, TextEncoder } from 'util';
import { configure } from '../test/react_testing_library';

configure({ asyncUtilTimeout: 5_000 });

// styled-components version 5.3.1 and above requires this remapping for jest
// environments, reference: https://github.com/styled-components/styled-components/issues/3570
jest.mock('styled-components', () =>
  jest.requireActual('styled-components/dist/styled-components.browser.cjs.js')
);

globalThis.TextDecoder = TextDecoder as typeof globalThis.TextDecoder;
globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
