import { beforeAll, afterAll } from 'vite-plus/test';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';

beforeAll(setupTemporaryRootDir);
afterAll(clearTemporaryRootDir);
