import { beforeEach, vi } from 'vitest';
import { makeIdFactory } from '@votingworks/test-utils/id-factory';
import '@votingworks/fixtures/vitest-setup';
import '@votingworks/image-utils/vitest-setup';
import '@votingworks/printing/vitest-setup';

// Deterministic ID generation
const idFactory = makeIdFactory();

vi.mock(import('nanoid'), () => ({
  customAlphabet: () => () => idFactory.next(),
}));
beforeEach(() => idFactory.reset());
