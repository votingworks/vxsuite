import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import { afterAll, beforeAll } from 'vitest';
import '../src/vitest_setup.js';

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
