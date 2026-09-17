import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { makeIdFactory } from './id_helpers.js';
import '@votingworks/image-utils/vitest-setup';
import '@votingworks/printing/vitest-setup';

// Deterministic ID generation
const idFactory = makeIdFactory();

vi.mock(import('nanoid'), () => ({
  customAlphabet: () => () => idFactory.next(),
}));
beforeEach(() => idFactory.reset());

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
