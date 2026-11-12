import { afterAll, beforeEach, vi } from 'vitest';
import '@votingworks/test-utils/vitest-setup';
import { makeIdFactory } from '@votingworks/test-utils/id-factory';
import { configure } from '@testing-library/react';

configure({ reactStrictMode: true });

const idFactory = makeIdFactory();

vi.mock(
  import('@votingworks/election-definition-backend'),
  async (importActual) => ({
    ...(await importActual()),
    generateId: () => idFactory.next(),
  })
);
beforeEach(() => idFactory.reset());

HTMLElement.prototype.scrollIntoView = vi.fn();

afterAll(() => {
  vi.useRealTimers();
});
