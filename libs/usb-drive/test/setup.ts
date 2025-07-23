import { afterEach, beforeEach } from 'vitest';
import {
  clearTemporaryRootDir,
  setupTemporaryRootDir,
} from '@votingworks/fixtures';

beforeEach(setupTemporaryRootDir);
afterEach(clearTemporaryRootDir);
