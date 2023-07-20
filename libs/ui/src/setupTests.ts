import '@testing-library/jest-dom/extend-expect';
import 'jest-styled-components';
import { configure } from '@testing-library/react';

jest.mock('styled-components', () =>
  jest.requireActual('styled-components/dist/styled-components.browser.cjs.js')
);

configure({ asyncUtilTimeout: 5_000 });
