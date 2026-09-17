import { afterAll, afterEach, vi } from 'vitest';
import '@votingworks/fixtures/vitest-setup';
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '../test/react_testing_library.js';
import {
  MockDocument,
  MockPage,
  setMockPdfNumPages,
} from '../test/react_pdf_mocks.js';

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

// Not implemented in jsdom:
HTMLElement.prototype.scrollIntoView = vi.fn();

afterAll(() => {
  vi.useRealTimers();
});
