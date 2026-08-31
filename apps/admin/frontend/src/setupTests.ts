import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import matchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '../test/react_testing_library.js';
import {
  MockDocument,
  MockPage,
  setMockPdfNumPages,
} from '../test/react_pdf_mocks.js';

expect.extend(matchers);

configure({ asyncUtilTimeout: 5_000 });

// Don't load the real react-pdf: importing it evaluates pdfjs-dist, which
// requires browser APIs (e.g. DOMMatrix) that jsdom doesn't provide.
vi.mock(
  import('react-pdf'),
  () =>
    ({
      pdfjs: { GlobalWorkerOptions: { workerSrc: '/mock', workerPort: 3000 } },
      Document: MockDocument,
      Page: MockPage,
    }) as unknown as typeof import('react-pdf')
);

afterEach(() => {
  cleanup();
  setMockPdfNumPages(1);
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);

// Not implemented in jsdom:
HTMLElement.prototype.scrollIntoView = vi.fn();

afterAll(() => {
  vi.useRealTimers();
});
