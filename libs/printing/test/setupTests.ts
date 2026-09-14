import { afterAll, beforeAll } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';
import '@votingworks/image-utils/vitest-setup';

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
