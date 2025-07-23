import { beforeAll, afterAll } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
