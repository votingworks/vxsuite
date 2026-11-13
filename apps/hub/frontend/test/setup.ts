import { afterAll, beforeEach, vi } from 'vitest';
import { makeIdFactory } from '@votingworks/test-utils/id-factory';
import '@votingworks/test-utils/vitest-setup';
import '@votingworks/fixtures/vitest-setup';
import '@votingworks/election-definition-ui/vitest-setup';

import { TextEncoder } from 'node:util';
import { configure } from '@testing-library/react';

configure({ reactStrictMode: true });

// Deterministic ID generation
const idFactory = makeIdFactory();

beforeEach(() => {
  idFactory.reset();
});

vi.mock(import('nanoid'), () => ({
  customAlphabet: () => () => idFactory.next(),
}));

// Don't load the real react-pdf: importing it evaluates pdfjs-dist, which
// requires browser APIs (e.g. DOMMatrix) that jsdom doesn't provide. Tests
// that exercise the PDF viewer (e.g. ballot_screen.test.tsx) register their
// own richer mock, which takes precedence over this one.
vi.mock(
  import('react-pdf'),
  () =>
    ({
      pdfjs: { GlobalWorkerOptions: { workerSrc: 'mock-worker-src' } },
      Document: () => null,
      Page: () => null,
    }) as unknown as typeof import('react-pdf')
);

global.TextEncoder = TextEncoder;

URL.createObjectURL = vi.fn();

// Not implemented in jsdom:
HTMLElement.prototype.scrollIntoView = vi.fn();

afterAll(() => {
  vi.useRealTimers();
});
