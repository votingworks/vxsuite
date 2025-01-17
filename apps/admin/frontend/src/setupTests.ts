// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import '@testing-library/jest-dom/extend-expect';
import 'jest-styled-components';
import { configure } from '../test/react_testing_library';
import {
  MockDocument,
  MockPage,
  setMockPdfNumPages,
} from '../test/react_pdf_mocks';

configure({ asyncUtilTimeout: 5_000 });

// styled-components version 5.3.1 and above requires this remapping for jest
// environments, reference: https://github.com/styled-components/styled-components/issues/3570
jest.mock('styled-components', () =>
  jest.requireActual('styled-components/dist/styled-components.browser.cjs.js')
);

jest.mock('react-pdf', (): typeof import('react-pdf') => {
  const original = jest.requireActual('react-pdf');
  return {
    ...original,
    pdfjs: { GlobalWorkerOptions: { workerSrc: '/mock', workerPort: 3000 } },
    Document: MockDocument,
    Page: MockPage,
  };
});

afterEach(() => {
  setMockPdfNumPages(1);
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
