import { afterAll, beforeAll } from 'vite-plus/test';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
