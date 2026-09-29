import { beforeEach, vi } from 'vitest';
import '@votingworks/fixtures/vitest-setup';
import '@votingworks/image-utils/vitest-setup';
import '@votingworks/printing/vitest-setup';
import { makeIdFactory } from './id_helpers.js';

// Deterministic ID generation
const idFactory = makeIdFactory();

vi.mock(import('nanoid'), () => ({
  customAlphabet: () => () => idFactory.next(),
}));
beforeEach(() => idFactory.reset());
