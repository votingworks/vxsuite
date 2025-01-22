import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import matchers from '@testing-library/jest-dom/matchers';
import { cleanup, configure } from '../test/react_testing_library';
import {
  MockDocument,
  MockPage,
  setMockPdfNumPages,
} from '../test/react_pdf_mocks';

expect.extend(matchers);

configure({ asyncUtilTimeout: 5_000 });

vi.mock(import('react-pdf'), async (importActual) => {
  const original = await importActual();
  return {
    ...original,
    pdfjs: { GlobalWorkerOptions: { workerSrc: '/mock', workerPort: 3000 } },
    Document: MockDocument,
    Page: MockPage,
  } as unknown as typeof original;
});

afterEach(() => {
  cleanup();
  setMockPdfNumPages(1);
});

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
